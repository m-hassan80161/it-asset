import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";

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
      },
    });
  }
}
