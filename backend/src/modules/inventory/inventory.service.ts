import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DeviceComponentDto } from "./dto/device-component.dto";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";

type ComponentSnapshot = Prisma.InputJsonObject;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Full upsert of a device report coming from the PowerShell collector.
   * Runs as a single transaction so a partial failure never leaves the
   * device in a half-updated state.
   */
  async ingest(payload: InventoryPayloadDto) {
    const device = await this.prisma.$transaction(async (tx) => {
      const dev = await tx.device.upsert({
        where: { computerName: payload.computerName },
        create: {
          computerName: payload.computerName,
          loggedInUser: payload.loggedInUser,
          osName: payload.osName,
          osVersion: payload.osVersion,
          osBuild: payload.osBuild,
          domain: payload.domain,
        },
        update: {
          loggedInUser: payload.loggedInUser,
          osName: payload.osName,
          osVersion: payload.osVersion,
          osBuild: payload.osBuild,
          domain: payload.domain,
          lastSeenAt: new Date(),
        },
      });

      await tx.cpuInfo.upsert({
        where: { deviceId: dev.id },
        create: { deviceId: dev.id, ...payload.cpu },
        update: { ...payload.cpu },
      });

      await tx.motherboardInfo.upsert({
        where: { deviceId: dev.id },
        create: { deviceId: dev.id, ...payload.motherboard },
        update: { ...payload.motherboard },
      });

      // Replace-all strategy for collection children (simplest correctness
      // guarantee for a "current snapshot" model)
      await tx.ramModule.deleteMany({ where: { deviceId: dev.id } });
      if (payload.ramModules?.length) {
        await tx.ramModule.createMany({
          data: payload.ramModules.map((r) => ({ deviceId: dev.id, ...r })),
        });
      }

      await tx.diskDrive.deleteMany({ where: { deviceId: dev.id } });
      if (payload.disks?.length) {
        await tx.diskDrive.createMany({
          data: payload.disks.map((d) => ({
            deviceId: dev.id,
            type: d.type as any,
            serialNumber: d.serialNumber,
            totalSpaceGb: d.totalSpaceGb,
            freeSpaceGb: d.freeSpaceGb,
          })),
        });
      }

      await tx.installedSoftware.deleteMany({ where: { deviceId: dev.id } });
      if (payload.software?.length) {
        await tx.installedSoftware.createMany({
          data: payload.software.map((item) => ({
            deviceId: dev.id,
            name: item.name,
            version: item.version,
            publisher: item.publisher,
            installDate: this.parseInstallDate(item.installDate),
          })),
        });
      }

      if (payload.gitConfig) {
        await tx.gitConfig.upsert({
          where: { deviceId: dev.id },
          create: { deviceId: dev.id, ...payload.gitConfig },
          update: { ...payload.gitConfig },
        });
      }

      return dev;
    });

    this.logger.log(`Ingested inventory for ${device.computerName}`);
    return { deviceId: device.id, status: "ok" };
  }

  private parseInstallDate(value?: string): Date | undefined {
    if (!value) return undefined;

    const compactDate = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    const date = compactDate
      ? new Date(
          Date.UTC(
            Number(compactDate[1]),
            Number(compactDate[2]) - 1,
            Number(compactDate[3]),
          ),
        )
      : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid software install date: ${value}`);
    }

    if (
      compactDate &&
      (date.getUTCFullYear() !== Number(compactDate[1]) ||
        date.getUTCMonth() !== Number(compactDate[2]) - 1 ||
        date.getUTCDate() !== Number(compactDate[3]))
    ) {
      throw new BadRequestException(`Invalid software install date: ${value}`);
    }

    return date;
  }

  async listDevices(
    params: { skip?: number; take?: number; softwareName?: string } = {},
  ) {
    const softwareName = params.softwareName?.trim();
    return this.prisma.device.findMany({
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      orderBy: { lastSeenAt: "desc" },
      where: softwareName
        ? {
            software: {
              some: {
                name: { contains: softwareName, mode: "insensitive" },
              },
            },
          }
        : undefined,
      include: {
        cpu: true,
        disks: true,
        software: true,
      },
    });
  }

  async deleteDevice(id: string) {
    const result = await this.prisma.device.deleteMany({ where: { id } });
    if (result.count === 0) {
      throw new NotFoundException(`Device ${id} was not found`);
    }
    return { id, status: "deleted" };
  }

  async addDeviceComponent(deviceId: string, dto: DeviceComponentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureDeviceExists(tx, deviceId);
      const data = this.normalizeComponent(dto);
      const component = await tx.deviceComponent.create({
        data: { deviceId, ...data },
      });

      await tx.deviceComponentHistory.create({
        data: {
          deviceId,
          componentId: component.id,
          componentName: this.componentName(data),
          action: "ADDED",
          newValue: this.componentSnapshot(data),
        },
      });

      return component;
    });
  }

  async updateDeviceComponent(
    deviceId: string,
    componentId: string,
    dto: DeviceComponentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deviceComponent.findFirst({
        where: { id: componentId, deviceId },
      });
      if (!current) {
        throw new NotFoundException(`Component ${componentId} was not found`);
      }

      const data = this.normalizeComponent(dto);
      const previousValue = this.componentSnapshot(current);
      const newValue = this.componentSnapshot(data);
      if (JSON.stringify(previousValue) === JSON.stringify(newValue)) {
        return current;
      }

      const component = await tx.deviceComponent.update({
        where: { id: componentId },
        data,
      });
      await tx.deviceComponentHistory.create({
        data: {
          deviceId,
          componentId,
          componentName: this.componentName(data),
          action: "UPDATED",
          previousValue,
          newValue,
        },
      });

      return component;
    });
  }

  async removeDeviceComponent(deviceId: string, componentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const component = await tx.deviceComponent.findFirst({
        where: { id: componentId, deviceId },
      });
      if (!component) {
        throw new NotFoundException(`Component ${componentId} was not found`);
      }

      const previousValue = this.componentSnapshot(component);
      await tx.deviceComponentHistory.create({
        data: {
          deviceId,
          componentId,
          componentName: this.componentName(component),
          action: "REMOVED",
          previousValue,
        },
      });
      await tx.deviceComponent.delete({ where: { id: componentId } });

      return { id: componentId, status: "deleted" };
    });
  }

  private async ensureDeviceExists(
    tx: Prisma.TransactionClient,
    deviceId: string,
  ) {
    const device = await tx.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} was not found`);
    }
  }

  private normalizeComponent(dto: DeviceComponentDto) {
    const category = dto.category.trim();
    const name = dto.name.trim();
    if (!category || !name) {
      throw new BadRequestException("Component category and name are required");
    }

    const specifications: Record<string, string> = {};
    const entries = Object.entries(dto.specifications ?? {});
    if (entries.length > 30) {
      throw new BadRequestException("A component can have at most 30 specifications");
    }
    for (const [rawKey, rawValue] of entries) {
      if (typeof rawKey !== "string" || typeof rawValue !== "string") {
        throw new BadRequestException("Component specifications must be text values");
      }
      const key = rawKey.trim();
      const value = rawValue.trim();
      if (!key || key.length > 80 || value.length > 500) {
        throw new BadRequestException("Component specification names or values are invalid");
      }
      if (value) specifications[key] = value;
    }

    return {
      category,
      name,
      manufacturer: dto.manufacturer?.trim() || null,
      model: dto.model?.trim() || null,
      sizeInches: dto.sizeInches != null && dto.sizeInches > 0
        ? dto.sizeInches
        : null,
      details: dto.details?.trim() || null,
      specifications,
    };
  }

  private componentSnapshot(value: {
    category: string;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    sizeInches?: number | null;
    details?: string | null;
    specifications?: Prisma.JsonValue;
  }): ComponentSnapshot {
    return {
      category: value.category,
      name: value.name,
      manufacturer: value.manufacturer ?? null,
      model: value.model ?? null,
      sizeInches: value.sizeInches ?? null,
      details: value.details ?? null,
      specifications: value.specifications ?? {},
    };
  }

  private componentName(value: { category: string; name: string }) {
    return `${value.category} / ${value.name}`;
  }

  async getDeviceDetail(id: string) {
    return this.prisma.device.findUnique({
      where: { id },
      include: {
        cpu: true,
        motherboard: true,
        ramModules: true,
        disks: true,
        software: true,
        gitConfig: true,
        components: { orderBy: [{ category: "asc" }, { name: "asc" }] },
        componentHistory: { orderBy: { changedAt: "desc" } },
      },
    });
  }
}
