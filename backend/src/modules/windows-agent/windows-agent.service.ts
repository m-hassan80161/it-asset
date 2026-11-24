import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { randomBytes, createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryPayloadDto } from "../inventory/dto/inventory-payload.dto";
import { InventoryService } from "../inventory/inventory.service";
import { EnrollAgentDto } from "./dto/enroll-agent.dto";
import { AgentHeartbeatDto } from "./dto/agent-heartbeat.dto";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const MAX_RELEASE_SIZE = 200 * 1024 * 1024;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

type UploadedRelease = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

function isJsonObject(
  value: Prisma.InputJsonValue | null | undefined,
): value is Prisma.InputJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@Injectable()
export class WindowsAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly inventory: InventoryService,
  ) {}

  async enroll(dto: EnrollAgentDto) {
    const secret = randomBytes(32).toString("base64url");
    const secretHash = this.hash(secret);
    const macAddresses = this.normalizeMacAddresses(dto.macAddresses);
    const now = new Date();
    const inventoryPayload = dto.snapshot
      ? this.toInventoryPayload(dto.snapshot, dto)
      : undefined;

    const agent = await this.prisma.$transaction(async (transaction) => {
      let createdAgent: { id: string };
      try {
        createdAgent = await transaction.windowsAgent.create({
          data: {
            installId: dto.installId,
            computerName: dto.computerName.trim(),
            primaryMac: macAddresses[0] ?? null,
            macAddresses,
            loggedInUser: dto.loggedInUser?.trim() || null,
            domain: dto.domain?.trim() || null,
            osName: dto.osName?.trim() || null,
            osVersion: dto.osVersion?.trim() || null,
            agentVersion: dto.agentVersion.trim(),
            secretHash,
            lastInventoryAt: dto.snapshot ? now : null,
            ...(dto.snapshot ? { snapshot: dto.snapshot } : {}),
            lastSeenAt: now,
          },
          select: { id: true },
        });
      } catch (error) {
        if (this.isPrismaUniqueViolation(error)) {
          throw new ConflictException("This agent installation is already enrolled");
        }
        throw error;
      }
      if (inventoryPayload) {
        await this.inventory.ingest(inventoryPayload, transaction);
      }
      return createdAgent;
    });
    return { agentId: agent.id, secret };
  }

  async createServerChangeCredential(agentId: string, createdById: string) {
    const agent = await this.prisma.windowsAgent.findUnique({
      where: { id: agentId },
      select: { id: true, isEnabled: true },
    });
    if (!agent) throw new NotFoundException("Windows agent not found");
    if (!agent.isEnabled) throw new BadRequestException("Enable the agent before changing its server");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.prisma.windowsAgentServerChangeCredential.create({
      data: {
        tokenHash: this.hash(token),
        windowsAgentId: agentId,
        createdById,
        expiresAt,
      },
      select: { id: true },
    });
    return { credential: token, expiresAt };
  }

  async authorizeServerChange(installId: string, credential: string) {
    const now = new Date();
    const tokenHash = this.hash(credential);
    const changeCredential = await this.prisma.windowsAgentServerChangeCredential.findUnique({
      where: { tokenHash },
      include: { agent: { select: { installId: true, isEnabled: true } } },
    });
    if (
      !changeCredential ||
      changeCredential.agent.installId !== installId ||
      !changeCredential.agent.isEnabled ||
      changeCredential.consumedAt ||
      changeCredential.expiresAt <= now
    ) {
      throw new BadRequestException("Credential is invalid, expired, or not issued for this agent");
    }
    const consumed = await this.prisma.windowsAgentServerChangeCredential.updateMany({
      where: {
        id: changeCredential.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException("Credential has already been used or expired");
    }
    return { authorized: true };
  }

  async heartbeat(agentId: string, dto: AgentHeartbeatDto) {
    const macAddresses = this.normalizeMacAddresses(dto.macAddresses);
    const now = new Date();
    const data = {
      computerName: dto.computerName.trim(),
      primaryMac: macAddresses[0] ?? null,
      macAddresses,
      loggedInUser: dto.loggedInUser?.trim() || null,
      domain: dto.domain?.trim() || null,
      osName: dto.osName?.trim() || null,
      osVersion: dto.osVersion?.trim() || null,
      agentVersion: dto.agentVersion.trim(),
      lastSeenAt: now,
      ...(dto.snapshot ? { lastInventoryAt: now, snapshot: dto.snapshot } : {}),
    };

    if (!dto.snapshot) {
      return this.prisma.windowsAgent.update({
        where: { id: agentId },
        data,
        select: { id: true, lastSeenAt: true },
      });
    }

    const inventoryPayload = this.toInventoryPayload(dto.snapshot, dto);
    return this.prisma.$transaction(async (transaction) => {
      const agent = await transaction.windowsAgent.update({
        where: { id: agentId },
        data,
        select: { id: true, lastSeenAt: true },
      });
      await this.inventory.ingest(inventoryPayload, transaction);
      return agent;
    });
  }

  private toInventoryPayload(
    snapshot: Prisma.InputJsonObject,
    identity: Pick<AgentHeartbeatDto, "computerName" | "loggedInUser" | "domain" | "osName" | "osVersion">,
  ): InventoryPayloadDto {
    const object = (
      value: Prisma.InputJsonValue | null | undefined,
      field: string,
    ): Prisma.InputJsonObject => {
      if (!isJsonObject(value)) {
        throw new BadRequestException(`Agent inventory field "${field}" must be an object`);
      }
      return value;
    };
    const text = (
      value: Prisma.InputJsonValue | null | undefined,
      field: string,
      required = false,
    ): string | undefined => {
      if (value === undefined || value === null) {
        if (required) throw new BadRequestException(`Agent inventory field "${field}" is required`);
        return undefined;
      }
      if (typeof value !== "string") {
        throw new BadRequestException(`Agent inventory field "${field}" must be a string`);
      }
      return value;
    };
    const number = (value: Prisma.InputJsonValue | null | undefined, field: string): number => {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`Agent inventory field "${field}" must be a non-negative finite number`);
      }
      return value;
    };
    const integer = (value: Prisma.InputJsonValue | null | undefined, field: string): number => {
      const result = number(value, field);
      if (!Number.isInteger(result)) {
        throw new BadRequestException(`Agent inventory field "${field}" must be an integer`);
      }
      return result;
    };
    const requiredText = (value: Prisma.InputJsonValue | null | undefined, field: string): string => {
      const result = text(value, field, true);
      if (result === undefined) throw new BadRequestException(`Agent inventory field "${field}" is required`);
      return result;
    };
    const array = (parent: Prisma.InputJsonObject, key: string): Prisma.InputJsonObject[] => {
      const value = parent[key];
      if (!Array.isArray(value)) {
        throw new BadRequestException(`Agent inventory field "${key}" must be an array`);
      }
      return value.map((entry, index) => object(entry, `${key}[${index}]`));
    };
    const root = object(snapshot, "snapshot");
    const cpu = object(root.cpu, "cpu");
    const motherboard = object(root.motherboard, "motherboard");
    const formFactor = text(root.formFactor, "formFactor");
    const diskType = (disk: Prisma.InputJsonObject, index: number): "SSD" | "HDD" | "NVME" | "UNKNOWN" => {
      const value = text(disk.type, `disks[${index}].type`);
      return value === "SSD" || value === "HDD" || value === "NVME" ? value : "UNKNOWN";
    };

    return {
      computerName: text(root.computerName, "computerName")?.trim() || identity.computerName.trim(),
      loggedInUser: text(root.loggedInUser, "loggedInUser") ?? identity.loggedInUser,
      osName: text(root.osName, "osName") ?? identity.osName,
      osVersion: text(root.osVersion, "osVersion") ?? identity.osVersion,
      osBuild: text(root.osBuild, "osBuild"),
      domain: text(root.domain, "domain") ?? identity.domain,
      formFactor: formFactor === "LAPTOP" || formFactor === "PC" ? formFactor : "UNKNOWN",
      cpu: {
        model: requiredText(cpu.model, "cpu.model"),
        cores: integer(cpu.cores, "cpu.cores"),
        threads: integer(cpu.threads, "cpu.threads"),
        clockSpeedMhz: integer(cpu.clockSpeedMhz, "cpu.clockSpeedMhz"),
        architecture: requiredText(cpu.architecture, "cpu.architecture"),
      },
      motherboard: {
        manufacturer: requiredText(motherboard.manufacturer, "motherboard.manufacturer"),
        model: requiredText(motherboard.model, "motherboard.model"),
        serialNumber: text(motherboard.serialNumber, "motherboard.serialNumber"),
      },
      ramModules: array(root, "ramModules").map((module, index) => ({
        capacityGb: number(module.capacityGb, `ramModules[${index}].capacityGb`),
        speedMhz: integer(module.speedMhz, `ramModules[${index}].speedMhz`),
        serialNumber: text(module.serialNumber, `ramModules[${index}].serialNumber`),
        slot: text(module.slot, `ramModules[${index}].slot`),
      })),
      disks: array(root, "disks").map((disk, index) => ({
        type: diskType(disk, index),
        serialNumber: text(disk.serialNumber, `disks[${index}].serialNumber`),
        totalSpaceGb: number(disk.totalSpaceGb, `disks[${index}].totalSpaceGb`),
        freeSpaceGb: number(disk.freeSpaceGb, `disks[${index}].freeSpaceGb`),
      })),
      software: array(root, "software").map((item, index) => ({
        name: requiredText(item.name, `software[${index}].name`),
        version: text(item.version, `software[${index}].version`) ?? "",
        publisher: text(item.publisher, `software[${index}].publisher`),
        installDate: text(item.installDate, `software[${index}].installDate`),
      })),
    };
  }

  async listAgents() {
    const agents = await this.prisma.windowsAgent.findMany({
      orderBy: [{ lastSeenAt: "desc" }, { computerName: "asc" }],
      select: {
        id: true,
        computerName: true,
        primaryMac: true,
        macAddresses: true,
        loggedInUser: true,
        domain: true,
        osName: true,
        osVersion: true,
        agentVersion: true,
        lastSeenAt: true,
        lastInventoryAt: true,
        isEnabled: true,
        enrolledAt: true,
      },
    });
    const onlineCutoff = Date.now() - ONLINE_WINDOW_MS;
    return agents.map((agent) => ({
      ...agent,
      online: agent.isEnabled && agent.lastSeenAt.getTime() >= onlineCutoff,
    }));
  }

  async setAgentEnabled(id: string, isEnabled: boolean) {
    try {
      return await this.prisma.windowsAgent.update({
        where: { id },
        data: { isEnabled },
        select: { id: true, isEnabled: true },
      });
    } catch (error) {
      if (this.isPrismaNotFound(error)) throw new NotFoundException("Windows agent not found");
      throw error;
    }
  }

  async latestRelease() {
    const release = await this.prisma.windowsAgentRelease.findFirst({
      orderBy: { publishedAt: "desc" },
      select: { version: true, notes: true, sha256: true, signature: true, publishedAt: true },
    });
    return release ?? { version: null };
  }

  async publishRelease(
    file: UploadedRelease,
    version: string,
    notes: string | undefined,
    signature: string,
    publishedBy: string,
  ) {
    if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
      throw new BadRequestException("Version must use x.y.z or x.y.z-prerelease format");
    }
    if (!file || file.size < 1 || file.size > MAX_RELEASE_SIZE) {
      throw new BadRequestException("The MSI package must be between 1 byte and 200 MB");
    }
    if (!basename(file.originalname).toLowerCase().endsWith(".msi")) {
      throw new BadRequestException("Only MSI packages are accepted");
    }
    const detachedSignature = typeof signature === "string" ? signature.trim() : "";
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(detachedSignature)) {
      throw new BadRequestException("A base64 detached RSA signature is required");
    }
    const configuredKey = this.config.get<string>("AGENT_UPDATE_PUBLIC_KEY");
    if (!configuredKey?.trim()) {
      throw new ServiceUnavailableException("Agent release signing is not configured");
    }
    const publicKeyPem = configuredKey.includes("-----BEGIN")
      ? configuredKey
      : Buffer.from(configuredKey, "base64").toString("utf8");

    const signatureBytes = Buffer.from(detachedSignature, "base64");
    if (!signatureBytes.length || signatureBytes.toString("base64") !== detachedSignature) {
      throw new BadRequestException("The detached signature is not valid base64");
    }
    let validSignature = false;
    try {
      validSignature = verifySignature(
        "sha256",
        file.buffer,
        createPublicKey(publicKeyPem),
        signatureBytes,
      );
    } catch {
      throw new BadRequestException("The configured signing key or detached signature is invalid");
    }
    if (!validSignature) throw new BadRequestException("The MSI signature verification failed");

    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const directory = this.releaseDirectory();
    await mkdir(directory, { recursive: true, mode: 0o750 });
    const storageName = `${version}-${randomBytes(8).toString("hex")}.msi`;
    const storagePath = join(directory, storageName);
    await writeFile(storagePath, file.buffer, { flag: "wx", mode: 0o640 });

    try {
      const release = await this.prisma.windowsAgentRelease.create({
        data: {
          version,
          notes: typeof notes === "string" ? notes.trim().slice(0, 2000) : "",
          fileName: basename(file.originalname).slice(0, 180),
          storagePath,
          sha256,
          signature: signatureBytes.toString("base64"),
          publishedBy,
        },
        select: { version: true, notes: true, sha256: true, publishedAt: true },
      });
      return release;
    } catch (error) {
      await unlink(storagePath);
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("This agent version has already been published");
      }
      throw error;
    }
  }

  async releasePackage(version: string) {
    const release = await this.prisma.windowsAgentRelease.findUnique({ where: { version } });
    if (!release) throw new NotFoundException("Agent release not found");
    return {
      stream: createReadStream(release.storagePath),
      fileName: release.fileName,
      sha256: release.sha256,
      signature: release.signature,
    };
  }

  private normalizeMacAddresses(values: string[]) {
    return [...new Set(values.map((value) => value.toLowerCase().replace(/-/g, ":")))];
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private releaseDirectory() {
    return this.config.get<string>("AGENT_RELEASES_DIR") || "/data/agent-releases";
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private isPrismaNotFound(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
  }
}
