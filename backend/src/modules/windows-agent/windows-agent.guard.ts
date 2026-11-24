import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";

interface WindowsAgentRequest extends Request {
  windowsAgentId?: string;
}

@Injectable()
export class WindowsAgentGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<WindowsAgentRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
    if (!match) throw new UnauthorizedException("Agent authentication required");

    const secretHash = createHash("sha256").update(match[1]).digest("hex");
    const agent = await this.prisma.windowsAgent.findUnique({
      where: { secretHash },
      select: { id: true, isEnabled: true },
    });
    if (!agent?.isEnabled) throw new UnauthorizedException("Agent credential is invalid or disabled");
    request.windowsAgentId = agent.id;
    return true;
  }
}
