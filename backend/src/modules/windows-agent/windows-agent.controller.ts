import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request, Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { AuthorizeServerChangeDto } from "./dto/authorize-server-change.dto";
import { AgentHeartbeatDto } from "./dto/agent-heartbeat.dto";
import { EnrollAgentDto } from "./dto/enroll-agent.dto";
import { WindowsAgentGuard } from "./windows-agent.guard";
import { WindowsAgentService } from "./windows-agent.service";

interface AgentRequest extends Request {
  windowsAgentId?: string;
}

@ApiTags("windows-agent")
@Controller("windows-agent")
export class WindowsAgentController {
  constructor(private readonly windowsAgentService: WindowsAgentService) {}

  @Public()
  @Post("enroll")
  enroll(@Body() dto: EnrollAgentDto) {
    return this.windowsAgentService.enroll(dto);
  }

  @Public()
  @Post("configuration/authorize")
  authorizeServerChange(@Body() dto: AuthorizeServerChangeDto) {
    return this.windowsAgentService.authorizeServerChange(dto.installId, dto.credential);
  }

  @Public()
  @UseGuards(WindowsAgentGuard)
  @Post("heartbeat")
  heartbeat(@Req() request: AgentRequest, @Body() dto: AgentHeartbeatDto) {
    if (!request.windowsAgentId) throw new BadRequestException("Agent authentication required");
    return this.windowsAgentService.heartbeat(request.windowsAgentId, dto);
  }

  @Public()
  @UseGuards(WindowsAgentGuard)
  @Get("releases/latest")
  latestRelease() {
    return this.windowsAgentService.latestRelease();
  }

  @Public()
  @UseGuards(WindowsAgentGuard)
  @Get("releases/:version/package")
  async releasePackage(
    @Param("version") version: string,
    @Res() response: Response,
  ) {
    const release = await this.windowsAgentService.releasePackage(version);
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename="ITAM-WindowsAgent-${version}.msi"`);
    response.setHeader("X-Agent-SHA256", release.sha256);
    response.setHeader("X-Agent-Signature", release.signature);
    release.stream.on("error", (error) => response.destroy(error));
    release.stream.pipe(response);
  }
}
