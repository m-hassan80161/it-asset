import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";
import { SoftwareComplianceService } from "../software-compliance/software-compliance.service";

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: SoftwareComplianceService,
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

      if (payload.gitConfig) {
        await tx.gitConfig.upsert({
          where: { deviceId: dev.id },
          create: { deviceId: dev.id, ...payload.gitConfig },
          update: { ...payload.gitConfig },
        });
      }

      return dev;
    });

    // Software is handled outside the main transaction because the
    // delta-detector needs to compare against ALL devices, not just this one.
    if (payload.software?.length) {
      await this.compliance.reconcileDeviceSoftware(device.id, payload.software);
    }

    this.logger.log(`Ingested inventory for ${device.computerName}`);
    return { deviceId: device.id, status: "ok" };
  }

  async listDevices(params: { skip?: number; take?: number } = {}) {
    return this.prisma.device.findMany({
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      orderBy: { lastSeenAt: "desc" },
      include: {
        cpu: true,
        disks: true,
        _count: { select: { complianceAlerts: { where: { resolved: false } } } },
      },
    });
  }

  async getDeviceDetail(id: string) {
    return this.prisma.device.findUnique({
      where: { id },
      include: {
        cpu: true,
        motherboard: true,
        ramModules: true,
        disks: true,
        software: { include: { masterSoftware: true } },
        gitConfig: true,
        complianceAlerts: { where: { resolved: false }, orderBy: { createdAt: "desc" } },
      },
    });
  }
}
