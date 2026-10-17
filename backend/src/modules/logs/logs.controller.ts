import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { LogQueryDto } from "./dto/log-query.dto";
import { LogsService } from "./logs.service";
import { ClientLogDto } from "./dto/client-log.dto";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags("logs")
@Controller("logs")
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: LogQueryDto) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.logsService.list(request.user, query);
  }

  @Get("analytics")
  analytics(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.logsService.analytics(request.user);
  }

  @Post("client")
  async clientEvent(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ClientLogDto,
  ) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    await this.logsService.safeRecord(
      this.logsService.clientEvent(request.user.id, dto),
    );
    return { status: "accepted" };
  }
}
