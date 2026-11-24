import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { WindowsAgentService } from "./windows-agent.service";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags("windows-agent-management")
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("agent-management")
export class WindowsAgentManagementController {
  constructor(private readonly windowsAgentService: WindowsAgentService) {}

  @Get()
  list() {
    return this.windowsAgentService.listAgents();
  }

  @Get("releases/latest")
  latestRelease() {
    return this.windowsAgentService.latestRelease();
  }

  @Post(":id/server-change-credentials")
  createServerChangeCredential(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.windowsAgentService.createServerChangeCredential(id, request.user.id);
  }

  @Patch(":id/enabled")
  setEnabled(@Param("id") id: string, @Body("isEnabled") isEnabled: unknown) {
    if (typeof isEnabled !== "boolean") {
      throw new BadRequestException("isEnabled must be a boolean");
    }
    return this.windowsAgentService.setAgentEnabled(id, isEnabled);
  }

  @Post("releases")
  @UseInterceptors(FileInterceptor("package", {
    limits: { fileSize: 200 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!file.originalname.toLowerCase().endsWith(".msi")) {
        callback(new BadRequestException("Only MSI packages are accepted"), false);
        return;
      }
      callback(null, true);
    },
  }))
  publishRelease(
    @Req() request: AuthenticatedRequest,
    @Body("version") version: string,
    @Body("notes") notes: string | undefined,
    @Body("signature") signature: string,
    @UploadedFile() file?: { originalname: string; size: number; buffer: Buffer },
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    if (!file) throw new BadRequestException("An MSI package is required");
    return this.windowsAgentService.publishRelease(file, version, notes, signature, request.user.fullName);
  }
}
