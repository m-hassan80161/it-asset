import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WindowsAgentService } from "./windows-agent.service";

describe("WindowsAgentService", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  let releaseDirectory: string;
  let service: WindowsAgentService;
  let createRelease: jest.Mock;
  let findAgents: jest.Mock;
  let createAgent: jest.Mock;
  let updateAgent: jest.Mock;
  let ingestInventory: jest.Mock;
  let createServerChangeCredential: jest.Mock;
  let findServerChangeCredential: jest.Mock;
  let consumeServerChangeCredential: jest.Mock;
  let serverChangeCredentialRecord: Record<string, unknown> | null;

  beforeEach(async () => {
    releaseDirectory = await mkdtemp(join(tmpdir(), "itam-agent-test-"));
    serverChangeCredentialRecord = null;
    createAgent = jest.fn(async () => ({ id: "agent-id" }));
    updateAgent = jest.fn(async () => ({ id: "agent-id", lastSeenAt: new Date() }));
    createServerChangeCredential = jest.fn(async ({ data }) => {
      serverChangeCredentialRecord = {
        id: "credential-id",
        ...data,
        consumedAt: null,
        agent: { installId: "e9554ecc-8ea4-4c10-9cba-1690b5acaa10", isEnabled: true },
      };
      return { id: "credential-id" };
    });
    findServerChangeCredential = jest.fn(async ({ where }) =>
      serverChangeCredentialRecord?.tokenHash === where.tokenHash ? serverChangeCredentialRecord : null,
    );
    consumeServerChangeCredential = jest.fn(async ({ where, data }) => {
      if (!serverChangeCredentialRecord ||
          serverChangeCredentialRecord.id !== where.id ||
          serverChangeCredentialRecord.consumedAt !== null ||
          (serverChangeCredentialRecord.expiresAt as Date) <= where.expiresAt.gt) {
        return { count: 0 };
      }
      serverChangeCredentialRecord.consumedAt = data.consumedAt;
      return { count: 1 };
    });
    createRelease = jest.fn(async ({ data }) => ({
      version: data.version,
      notes: data.notes,
      sha256: data.sha256,
      publishedAt: new Date(),
    }));
    findAgents = jest.fn();
    ingestInventory = jest.fn();
    const transaction = {
      windowsAgent: { create: createAgent, update: updateAgent },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
      windowsAgent: {
        findMany: findAgents,
        create: createAgent,
        findUnique: jest.fn(async () => ({ id: "agent-id", isEnabled: true })),
      },
      windowsAgentServerChangeCredential: {
        create: createServerChangeCredential,
        findUnique: findServerChangeCredential,
        updateMany: consumeServerChangeCredential,
      },
      windowsAgentRelease: { create: createRelease },
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === "AGENT_UPDATE_PUBLIC_KEY") return publicKey;
        if (key === "AGENT_RELEASES_DIR") return releaseDirectory;
        return undefined;
      }),
    };
    service = new WindowsAgentService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      { ingest: ingestInventory } as never,
    );
  });

  afterEach(async () => {
    await rm(releaseDirectory, { recursive: true, force: true });
  });

  it("uses the five-minute heartbeat window to report online status", async () => {
    const now = new Date();
    findAgents.mockResolvedValue([
      { id: "online", isEnabled: true, lastSeenAt: now },
      { id: "offline", isEnabled: true, lastSeenAt: new Date(now.getTime() - 6 * 60_000) },
      { id: "disabled", isEnabled: false, lastSeenAt: now },
    ]);

    const result = await service.listAgents();

    expect(result.map((agent) => agent.online)).toEqual([true, false, false]);
  });

  it("automatically enrolls a new installation and returns a per-agent secret", async () => {
    const agent = {
      installId: "e9554ecc-8ea4-4c10-9cba-1690b5acaa10",
      computerName: "WORKSTATION",
      agentVersion: "1.0.0",
      macAddresses: [],
      snapshot: {
        computerName: "WORKSTATION",
        formFactor: "LAPTOP",
        cpu: { model: "CPU", cores: 4, threads: 8, clockSpeedMhz: 2400, architecture: "x86_64" },
        motherboard: { manufacturer: "Maker", model: "Board", serialNumber: null },
        ramModules: [{ capacityGb: 8, speedMhz: 3200 }],
        disks: [{ type: "SSD", totalSpaceGb: 256, freeSpaceGb: 100 }],
        software: [{ name: "App", version: "1.0" }],
      },
    };

    const result = await service.enroll(agent);

    expect(result.agentId).toBe("agent-id");
    expect(result.secret).toHaveLength(43);
    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          installId: agent.installId,
          secretHash: expect.not.stringMatching(result.secret),
        }),
      }),
    );
    expect(ingestInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        computerName: "WORKSTATION",
        formFactor: "LAPTOP",
        disks: [expect.objectContaining({ type: "SSD", totalSpaceGb: 256 })],
        software: [expect.objectContaining({ name: "App", version: "1.0" })],
      }),
      expect.objectContaining({ windowsAgent: expect.any(Object) }),
    );
  });

  it("writes periodic Agent snapshots to the managed device inventory", async () => {
    await service.heartbeat("agent-id", {
      computerName: "WORKSTATION",
      agentVersion: "1.0.1",
      macAddresses: [],
      snapshot: {
        computerName: "WORKSTATION",
        formFactor: "PC",
        cpu: { model: "CPU", cores: 4, threads: 8, clockSpeedMhz: 2400, architecture: "x86_64" },
        motherboard: { manufacturer: "Maker", model: "Board", serialNumber: null },
        ramModules: [],
        disks: [],
        software: [],
      },
    });

    expect(updateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snapshot: expect.any(Object) }),
      }),
    );
    expect(ingestInventory).toHaveBeenCalledWith(
      expect.objectContaining({ computerName: "WORKSTATION", formFactor: "PC" }),
      expect.objectContaining({ windowsAgent: expect.any(Object) }),
    );
  });

  it("rejects re-enrollment of an existing installation without replacing its secret", async () => {
    createAgent.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      service.enroll({
        installId: "e9554ecc-8ea4-4c10-9cba-1690b5acaa10",
        computerName: "WORKSTATION",
        agentVersion: "1.0.0",
        macAddresses: [],
      }),
    ).rejects.toThrow("This agent installation is already enrolled");
  });

  it("creates a short-lived hashed credential and allows it once for its registered agent", async () => {
    const issued = await service.createServerChangeCredential("agent-id", "admin-id");

    expect(issued.credential).toHaveLength(43);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const storedHash = createServerChangeCredential.mock.calls[0][0].data.tokenHash;
    expect(storedHash).toBe(createHash("sha256").update(issued.credential).digest("hex"));
    expect(storedHash).not.toBe(issued.credential);

    await expect(
      service.authorizeServerChange("e9554ecc-8ea4-4c10-9cba-1690b5acaa10", issued.credential),
    ).resolves.toEqual({ authorized: true });
    await expect(
      service.authorizeServerChange("e9554ecc-8ea4-4c10-9cba-1690b5acaa10", issued.credential),
    ).rejects.toThrow("Credential is invalid, expired, or not issued for this agent");
    expect(consumeServerChangeCredential).toHaveBeenCalledTimes(1);
  });

  it("does not consume a server-change credential for a different installation", async () => {
    const issued = await service.createServerChangeCredential("agent-id", "admin-id");

    await expect(
      service.authorizeServerChange("77777777-7777-4777-8777-777777777777", issued.credential),
    ).rejects.toThrow("Credential is invalid, expired, or not issued for this agent");
    expect(consumeServerChangeCredential).not.toHaveBeenCalled();
  });

  it("publishes only an MSI whose detached RSA signature is valid", async () => {
    const bytes = Buffer.from("signed MSI test fixture");
    const signature = sign("sha256", bytes, privateKey).toString("base64");
    await service.publishRelease(
      { originalname: "agent.msi", size: bytes.length, buffer: bytes },
      "1.0.0",
      "First release",
      signature,
      "Administrator",
    );

    const files = await import("node:fs/promises").then((fs) => fs.readdir(releaseDirectory));
    expect(files).toHaveLength(1);
    expect(await readFile(join(releaseDirectory, files[0]))).toEqual(bytes);
    expect(createRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: "1.0.0", sha256: expect.any(String) }),
      }),
    );
  });

  it("rejects an MSI with an invalid update signature before storing it", async () => {
    const bytes = Buffer.from("tampered package");
    const signature = sign("sha256", Buffer.from("different package"), privateKey).toString("base64");

    await expect(
      service.publishRelease(
        { originalname: "agent.msi", size: bytes.length, buffer: bytes },
        "1.0.1",
        "",
        signature,
        "Administrator",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createRelease).not.toHaveBeenCalled();
    expect(await import("node:fs/promises").then((fs) => fs.readdir(releaseDirectory))).toEqual([]);
  });
});
