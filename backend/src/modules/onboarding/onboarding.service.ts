import { Injectable, Logger, Optional } from "@nestjs/common";
import { OnboardingStep } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ActiveDirectoryService } from "../active-directory/ad.service";
//import { FileServerService } from "../file-server/file-server.service";
import { CreateEmployeeOnboardingDto } from "./dto/create-employee-onboarding.dto";

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

constructor(
  private readonly prisma: PrismaService,
  private readonly adService: ActiveDirectoryService,
//  @Optional() private readonly fsService: FileServerService,  // ← أضف @Optional()
) {}

  /**
   * Main orchestration: runs all onboarding steps in sequence with logging.
   * On any failure, logs the error and marks the request as FAILED so admins
   * can retry or manually fix the issue.
   */
  async startOnboarding(dto: CreateEmployeeOnboardingDto) {
    const request = await this.prisma.onboardingRequest.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
        targetOuDn: dto.targetOuDn,
        managerDn: dto.managerDn,
        departmentFolderId: dto.departmentFolderId,
        requestedGroups: dto.requestedGroupDns,
        status: OnboardingStep.PENDING,
      },
    });

    this.logger.log(`Started onboarding for ${dto.username} (request ${request.id})`);

    try {
      // Step 1: Create AD User
      await this.logStep(request.id, OnboardingStep.AD_USER_CREATED, true, "Creating AD user...");
      const userDn = await this.adService.createUser({
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
        password: dto.password,
        targetOuDn: dto.targetOuDn,
      });
      await this.prisma.onboardingRequest.update({
        where: { id: request.id },
        data: { createdAdUserId: userDn, status: OnboardingStep.AD_USER_CREATED },
      });
      this.logger.log(`Step 1 OK: ${userDn}`);

      // Step 2: Add to groups + set manager
      await this.logStep(request.id, OnboardingStep.AD_GROUPS_ASSIGNED, true, "Assigning AD groups...");
      await this.adService.addUserToGroupsAndSetManager(userDn, dto.requestedGroupDns, dto.managerDn);
      await this.prisma.onboardingRequest.update({
        where: { id: request.id },
        data: { status: OnboardingStep.AD_GROUPS_ASSIGNED },
      });
      this.logger.log(`Step 2 OK: assigned ${dto.requestedGroupDns.length} group(s)`);

      // Step 3: Create folder (if department assigned)
      // let folderPath: string | undefined;
      // if (dto.departmentFolderId && this.fsService) {
      //   const dept = await this.prisma.departmentFolder.findUnique({
      //     where: { id: dto.departmentFolderId },
      //   });
      //   if (dept) {
      //     await this.logStep(request.id, OnboardingStep.FOLDER_CREATED, true, "Creating user folder...");
      //     folderPath = await this.fsService.createUserFolder(dept.uncPath, dto.username);
      //     await this.prisma.onboardingRequest.update({
      //       where: { id: request.id },
      //       data: { createdFolderPath: folderPath, status: OnboardingStep.FOLDER_CREATED },
      //     });
      //     this.logger.log(`Step 3 OK: ${folderPath}`);
      //   }
      // }

      // Step 4: Set NTFS permissions
      // if (folderPath && this.fsService) {
      //   await this.logStep(request.id, OnboardingStep.NTFS_PERMISSIONS_SET, true, "Setting NTFS permissions...");
      //   const manager = dto.managerDn
      //     ? await this.prisma.adUser.findUnique({ where: { distinguishedName: dto.managerDn } })
      //     : null;
      //   await this.fsService.setNtfsPermissions(folderPath, dto.username, manager?.sAMAccountName);
      //   await this.prisma.onboardingRequest.update({
      //     where: { id: request.id },
      //     data: { status: OnboardingStep.NTFS_PERMISSIONS_SET },
      //   });
      //   this.logger.log(`Step 4 OK: NTFS permissions set`);
      // }

      // Mark as completed
      await this.prisma.onboardingRequest.update({
        where: { id: request.id },
        data: { status: OnboardingStep.COMPLETED },
      });
      await this.logStep(request.id, OnboardingStep.COMPLETED, true, "Onboarding completed successfully");

      this.logger.log(`Onboarding ${request.id} completed for ${dto.username}`);
      return request;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Onboarding ${request.id} failed: ${message}`);
      await this.prisma.onboardingRequest.update({
        where: { id: request.id },
        data: { status: OnboardingStep.FAILED, errorMessage: message },
      });
      await this.logStep(request.id, OnboardingStep.FAILED, false, message);
      throw error;
    }
  }

  private async logStep(
    requestId: string,
    step: OnboardingStep,
    success: boolean,
    message: string,
  ): Promise<void> {
    await this.prisma.onboardingLog.create({
      data: { onboardingRequestId: requestId, step, success, message },
    });
  }

  async getOnboardingRequest(id: string) {
    return this.prisma.onboardingRequest.findUnique({
      where: { id },
      include: { logs: { orderBy: { createdAt: "asc" } } },
    });
  }

  async listOnboardingRequests(params: { skip?: number; take?: number; status?: OnboardingStep } = {}) {
    return this.prisma.onboardingRequest.findMany({
      skip: params.skip ?? 0,
      take: params.take ?? 20,
      where: params.status ? { status: params.status } : {},
      orderBy: { createdAt: "desc" },
      include: { logs: true },
    });
  }
}
