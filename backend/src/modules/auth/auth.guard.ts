import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  IS_PUBLIC_KEY,
  SESSION_COOKIE,
} from "./auth.constants";

interface AuthenticatedRequest extends Request {
  adminSessionId?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException("Authentication required");

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      select: { id: true, expiresAt: true },
    });
    if (!session) throw new UnauthorizedException("Authentication required");
    if (session.expiresAt <= new Date()) {
      await this.prisma.adminSession.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException("Session expired");
    }

    request.adminSessionId = session.id;
    return true;
  }

  private readCookie(cookieHeader: string | undefined, name: string): string | null {
    if (!cookieHeader) return null;
    const prefix = `${name}=`;
    const cookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return cookie ? cookie.slice(prefix.length) : null;
  }
}
