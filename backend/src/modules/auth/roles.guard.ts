import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { UserRole } from "@prisma/client";
import { IS_PUBLIC_KEY } from "./auth.constants";
import { AuthenticatedUser } from "./authenticated-user";
import { ROLES_KEY } from "./roles.decorator";

interface RoleRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const request = context.switchToHttp().getRequest<RoleRequest>();
    if (request.user && roles.includes(request.user.role)) return true;
    throw new ForbiddenException("Insufficient role permissions");
  }
}
