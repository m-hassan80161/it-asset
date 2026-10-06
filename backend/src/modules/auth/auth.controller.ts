import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE, SESSION_DURATION_MS } from "./auth.constants";
import { Public } from "./public.decorator";
import { LoginDto } from "./dto/login.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

interface AuthenticatedRequest extends Request {
  adminSessionId?: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(dto.username, dto.password);
    response.setHeader(
      "Set-Cookie",
      this.sessionCookie(session.token, SESSION_DURATION_MS),
    );
    return { username: session.username, expiresAt: session.expiresAt };
  }

  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    if (!request.adminSessionId) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.authService.getSettings();
  }

  @Get("settings")
  settings() {
    return this.authService.getSettings();
  }

  @Put("settings")
  async updateSettings(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!request.adminSessionId) {
      throw new UnauthorizedException("Authentication required");
    }
    const result = await this.authService.updateSettings(request.adminSessionId, dto);
    response.setHeader("Set-Cookie", this.sessionCookie("", 0));
    return result;
  }

  @Post("logout")
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (request.adminSessionId) {
      await this.authService.logout(request.adminSessionId);
    }
    response.setHeader("Set-Cookie", this.sessionCookie("", 0));
    return { status: "ok" };
  }

  private sessionCookie(token: string, maxAgeMs: number) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=${Math.floor(
      maxAgeMs / 1000,
    )}${secure}`;
  }
}
