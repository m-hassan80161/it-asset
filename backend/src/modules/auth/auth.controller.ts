import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { UpdateAdminBranchDto } from "./dto/update-admin-branch.dto";
import { CreateLocalUserDto } from "./dto/create-local-user.dto";
import { AuthenticatedUser } from "./authenticated-user";
import { UpdateLocalUserDto } from "./dto/update-local-user.dto";
import { DeleteLocalUserDto } from "./dto/delete-local-user.dto";

interface AuthenticatedRequest extends Request {
  adminSessionId?: string;
  user?: AuthenticatedUser;
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
    if (!request.adminSessionId) throw new UnauthorizedException("Authentication required");
    return this.authService.getSettings(request.adminSessionId);
  }

  @Get("settings")
  settings(@Req() request: AuthenticatedRequest) {
    if (!request.adminSessionId) throw new UnauthorizedException("Authentication required");
    return this.authService.getSettings(request.adminSessionId);
  }

  @Get("users")
  listUsers(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.authService.listUsers(request.user);
  }

  @Post("users")
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateLocalUserDto,
  ) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.authService.createUser(request.user, dto);
  }

  @Patch("users/:id")
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateLocalUserDto,
  ) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.authService.updateUser(request.user, id, dto);
  }

  @Delete("users/:id")
  deleteUser(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: DeleteLocalUserDto,
  ) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.authService.deleteUser(request.user, id, dto.permanentlyAfter30Days);
  }

  @Get("admins")
  listAdmins(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.authService.listAdmins(request.user);
  }

  @Put("admins/:id/branch")
  updateAdminBranch(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateAdminBranchDto,
  ) {
    if (!request.user) throw new UnauthorizedException("Authentication required");
    return this.authService.updateAdminBranch(request.user, id, dto);
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
