import { Injectable, Logger } from "@nestjs/common";
import * as semver from "semver";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ComplianceStatus } from "@prisma/client";

interface IncomingSoftware {
  name: string;
  version: string;
  publisher?: string;
  installDate?: string;
}

/**
 * Normalizes loose version strings (many installers don't ship strict
 * semver, e.g. "23.4" or "1.0.0.4521") into something semver can compare.
 */
function normalizeVersion(raw: string): string | null {
  const coerced = semver.coerce(raw);
  return coerced ? coerced.version : null;
}

@Injectable()
export class SoftwareComplianceService {
  private readonly logger = new Logger(SoftwareComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Replaces a device's software snapshot and:
   *  1. Computes compliance status against the master list.
   *  2. Runs the delta-update detector: if this device now reports a
   *     version higher than what's currently the majority/previous max
   *     across the fleet for that software, raise a ComplianceAlert.
   */
  async reconcileDeviceSoftware(deviceId: string, incoming: IncomingSoftware[]) {
    const masterList = await this.prisma.masterSoftware.findMany();
    const masterByName = new Map(masterList.map((m) => [m.name.toLowerCase(), m]));

    // Replace-all snapshot for this device
    await this.prisma.installedSoftware.deleteMany({ where: { deviceId } });

    for (const item of incoming) {
      const master = masterByName.get(item.name.toLowerCase());
      const status = this.computeStatus(item.version, master?.minRequiredVersion);

      await this.prisma.installedSoftware.create({
        data: {
          deviceId,
          name: item.name,
          version: item.version,
          publisher: item.publisher,
          installDate: item.installDate ? new Date(item.installDate) : undefined,
          masterSoftwareId: master?.id,
          complianceStatus: status,
        },
      });

      await this.runDeltaDetector(deviceId, item.name, item.version);
    }

    // Anything on the master list marked mandatory but absent = MISSING
    const incomingNames = new Set(incoming.map((i) => i.name.toLowerCase()));
    for (const master of masterList) {
      if (master.isMandatory && !incomingNames.has(master.name.toLowerCase())) {
        await this.prisma.installedSoftware.create({
          data: {
            deviceId,
            name: master.name,
            version: "0.0.0",
            masterSoftwareId: master.id,
            complianceStatus: ComplianceStatus.MISSING,
          },
        });
      }
    }
  }

  private computeStatus(installedVersion: string, minRequired?: string): ComplianceStatus {
    if (!minRequired) return ComplianceStatus.NOT_TRACKED;
    const installed = normalizeVersion(installedVersion);
    const required = normalizeVersion(minRequired);
    if (!installed || !required) return ComplianceStatus.NOT_TRACKED;
    return semver.gte(installed, required)
      ? ComplianceStatus.UP_TO_DATE
      : ComplianceStatus.OUTDATED;
  }

  /**
   * Delta-update detector.
   * Looks at every OTHER device's currently reported version of the same
   * software. If this device's version is strictly newer than the max
   * seen elsewhere, fire an alert naming how many devices lag behind.
   */
  private async runDeltaDetector(deviceId: string, softwareName: string, newVersion: string) {
    const newNorm = normalizeVersion(newVersion);
    if (!newNorm) return;

    const others = await this.prisma.installedSoftware.findMany({
      where: {
        name: { equals: softwareName, mode: "insensitive" },
        deviceId: { not: deviceId },
      },
      select: { version: true, deviceId: true },
    });

    if (others.length === 0) return; // nothing to compare against yet

    let laggingCount = 0;
    let isNewMax = true;
    for (const o of others) {
      const otherNorm = normalizeVersion(o.version);
      if (!otherNorm) continue;
      if (semver.lt(otherNorm, newNorm)) {
        laggingCount++;
      } else if (semver.gte(otherNorm, newNorm)) {
        isNewMax = false;
      }
    }

    if (isNewMax && laggingCount > 0) {
      const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
      const message = `Device ${device?.computerName} upgraded ${softwareName} to version ${newVersion}. ${laggingCount} other device(s) are still on older versions.`;

      await this.prisma.complianceAlert.create({
        data: { deviceId, softwareName, newVersion, message, laggingCount },
      });
      this.logger.warn(message);
    }
  }

  async listMasterList() {
    return this.prisma.masterSoftware.findMany({ orderBy: { name: "asc" } });
  }

  async upsertMasterSoftware(name: string, minRequiredVersion: string, isMandatory = false) {
    return this.prisma.masterSoftware.upsert({
      where: { name },
      create: { name, minRequiredVersion, isMandatory },
      update: { minRequiredVersion, isMandatory },
    });
  }

  async listOpenAlerts() {
    return this.prisma.complianceAlert.findMany({
      where: { resolved: false },
      include: { device: true },
      orderBy: { createdAt: "desc" },
    });
  }
}
