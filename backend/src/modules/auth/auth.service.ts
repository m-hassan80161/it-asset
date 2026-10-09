import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  createHash,
  randomUUID,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { SESSION_DURATION_MS } from "./auth.constants";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { CreateLocalUserDto } from "./dto/create-local-user.dto";
import { UserRole } from "@prisma/client";
import { AuthenticatedUser } from "./authenticated-user";
import { UpdateAdminBranchDto } from "./dto/update-admin-branch.dto";
import { LogsService } from "../logs/logs.service";
import { UpdateLocalUserDto } from "./dto/update-local-user.dto";

const scrypt = promisify(scryptCallback);
const ACCOUNT_ID = "admin";
const PASSWORD_MIN_LENGTH = 12;
const ACCOUNT_PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private purgeInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logsService: LogsService,
  ) {}

  async onModuleInit() {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: ACCOUNT_ID },
    });
    if (!account) {
      const initialPassword = this.config.get<string>("ADMIN_PASSWORD");
      if (!initialPassword || initialPassword.length < PASSWORD_MIN_LENGTH) {
        throw new InternalServerErrorException(
          "Set ADMIN_PASSWORD to a unique value with at least 12 characters before first startup.",
        );
      }
      const username = this.config.get<string>("ADMIN_USERNAME") || "admin";
      if (!/^[a-zA-Z0-9._@-]{3,64}$/.test(username)) {
        throw new InternalServerErrorException(
          "ADMIN_USERNAME must be 3-64 characters and contain only letters, numbers, dots, underscores, @, or hyphens.",
        );
      }
      await this.prisma.adminAccount.create({
        data: {
          id: ACCOUNT_ID,
          username,
          fullName: "System Administrator",
          role: UserRole.SUPER_ADMIN,
          passwordHash: await this.hashPassword(initialPassword),
        },
      });
    }
    await this.purgeExpiredAccounts();
    this.purgeInterval = setInterval(() => {
      void this.purgeExpiredAccounts().catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Scheduled account deletion scan failed: ${reason}`);
      });
    }, 60 * 60 * 1000);
    this.purgeInterval.unref?.();
  }

  onModuleDestroy() {
    if (this.purgeInterval) clearInterval(this.purgeInterval);
  }

  async login(username: string, password: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username },
    });
    if (
      !account ||
      !account.isActive ||
      !(await this.verifyPassword(password, account.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.prisma.adminSession.create({
      data: {
        adminId: account.id,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    return { token, expiresAt, username: account.username };
  }

  async getSettings(sessionId: string) {
    const session = await this.prisma.adminSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { adminId: true },
    });
    const account = await this.prisma.adminAccount.findUniqueOrThrow({
      where: { id: session.adminId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        branch: true,
        managedBranches: true,
      },
    });
    return account;
  }

  async listUsers(actor: AuthenticatedUser) {
    if (actor.role === UserRole.MANAGER) {
      throw new ForbiddenException("Account access is not available to managers");
    }
    return this.prisma.adminAccount.findMany({
      where:
        actor.role === UserRole.SUPER_ADMIN
          ? {}
          : actor.role === UserRole.ADMIN
            ? { role: UserRole.EMPLOYEE, branch: actor.branch ?? "" }
            : { id: actor.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        branch: true,
        managedBranches: true,
        isActive: true,
        createdAt: true,
        deleteAfter: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createUser(actor: AuthenticatedUser, dto: CreateLocalUserDto) {
    this.requireSuperAdmin(actor.role);
    this.validateRoleAssignments(dto.role, dto.branch, dto.managedBranches);
    if (await this.prisma.adminAccount.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException("Username is already in use");
    }
    const account = await this.prisma.adminAccount.create({
      data: {
        id: randomUUID(),
        username: dto.username,
        fullName: dto.fullName,
        passwordHash: await this.hashPassword(dto.password),
        role: dto.role,
        branch: dto.branch?.trim(),
        managedBranches: (dto.managedBranches ?? []).map((branch) => branch.trim()),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        branch: true,
        managedBranches: true,
        isActive: true,
        createdAt: true,
      },
    });
    await this.logsService.safeRecord(
      this.logsService.audit(actor.id, "Local account created", {
        targetUserId: account.id,
        role: account.role,
        branch: account.branch ?? "",
      }),
    );
    return account;
  }

  async updateUser(actor: AuthenticatedUser, targetId: string, dto: UpdateLocalUserDto) {
    const target = await this.prisma.adminAccount.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException("Account not found");

    if (actor.role === UserRole.EMPLOYEE) {
      if (actor.id !== target.id) {
        throw new ForbiddenException("Employees can only update their own account");
      }
      if (dto.role !== undefined || dto.branch !== undefined ||
          dto.managedBranches !== undefined || dto.isActive !== undefined) {
        throw new ForbiddenException("Employees can only update their name, username, or password");
      }
    } else if (actor.role === UserRole.ADMIN) {
      if (
        target.role !== UserRole.EMPLOYEE ||
        target.branch !== actor.branch ||
        dto.role !== undefined ||
        dto.branch !== undefined ||
        dto.managedBranches !== undefined ||
        dto.isActive !== undefined
      ) {
        throw new ForbiddenException("Admins may only edit employee details within their branch");
      }
    } else if (actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Insufficient account management permissions");
    }

    const newRole = dto.role ?? target.role;
    const newBranch = dto.branch === undefined ? target.branch : dto.branch;
    const newManagedBranches =
      dto.managedBranches ??
      (dto.role !== undefined && dto.role !== target.role ? [] : target.managedBranches);
    if (actor.role === UserRole.SUPER_ADMIN) {
      this.validateRoleAssignments(newRole, newBranch ?? undefined, newManagedBranches);
      const losingLastSuperAdmin =
        target.role === UserRole.SUPER_ADMIN &&
        target.isActive &&
        (newRole !== UserRole.SUPER_ADMIN || dto.isActive === false);
      if (losingLastSuperAdmin) await this.ensureAnotherActiveSuperAdmin(target.id);
    }

    const username = dto.username?.trim();
    if (username && username !== target.username) {
      const collision = await this.prisma.adminAccount.findUnique({ where: { username } });
      if (collision) throw new ConflictException("Username is already in use");
    }
    const passwordHash = dto.password
      ? await this.hashPassword(dto.password)
      : undefined;
    const updated = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.adminAccount.update({
        where: { id: target.id },
        data: {
          username,
          fullName: dto.fullName?.trim(),
          passwordHash,
          ...(actor.role === UserRole.SUPER_ADMIN
            ? {
                role: newRole,
                branch: newBranch,
                managedBranches: newManagedBranches.map((branch) => branch.trim()),
                isActive: dto.isActive,
              }
            : {}),
          ...(dto.isActive === true ? { deleteAfter: null } : {}),
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          branch: true,
          managedBranches: true,
          isActive: true,
          deleteAfter: true,
        },
      });
      if (passwordHash || username) {
        await transaction.adminSession.deleteMany({ where: { adminId: target.id } });
      }
      await transaction.applicationLog.create({
        data: {
          level: "INFO",
          source: "BACKEND",
          userId: actor.id,
          message: "Local account updated",
          details: {
            targetUserId: target.id,
            changedFields: Object.keys(dto),
          },
        },
      });
      return account;
    });
    return updated;
  }

  async deleteUser(
    actor: AuthenticatedUser,
    targetId: string,
    permanentlyAfter30Days: boolean,
  ) {
    const target = await this.prisma.adminAccount.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException("Account not found");
    if (actor.role === UserRole.ADMIN) {
      if (target.role !== UserRole.EMPLOYEE || target.branch !== actor.branch) {
        throw new ForbiddenException("Admins may only delete employees within their branch");
      }
    } else if (actor.role === UserRole.SUPER_ADMIN) {
      if (target.role === UserRole.SUPER_ADMIN && target.isActive) {
        await this.ensureAnotherActiveSuperAdmin(target.id);
      }
    } else {
      throw new ForbiddenException("Only admins can deactivate accounts");
    }

    const deleteAfter = permanentlyAfter30Days
      ? new Date(Date.now() + ACCOUNT_PURGE_DELAY_MS)
      : null;
    await this.prisma.$transaction([
      this.prisma.adminAccount.update({
        where: { id: target.id },
        data: { isActive: false, deleteAfter },
      }),
      this.prisma.adminSession.deleteMany({ where: { adminId: target.id } }),
      this.prisma.applicationLog.create({
        data: {
          level: "WARNING",
          source: "BACKEND",
          userId: actor.id,
          message: permanentlyAfter30Days
            ? "Account deactivated and scheduled for permanent deletion"
            : "Account deactivated",
          details: {
            targetUserId: target.id,
            permanentlyAfter30Days,
            deleteAfter: deleteAfter?.toISOString() ?? null,
          },
        },
      }),
    ]);
    return { id: target.id, isActive: false, deleteAfter };
  }

  async listAdmins(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.MANAGER && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Manager access required");
    }
    return this.prisma.adminAccount.findMany({
      where: {
        role: UserRole.ADMIN,
        ...(actor.role === UserRole.MANAGER
          ? { branch: { in: actor.managedBranches } }
          : {}),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        branch: true,
        isActive: true,
      },
      orderBy: [{ branch: "asc" }, { fullName: "asc" }],
    });
  }

  async updateAdminBranch(
    actor: AuthenticatedUser,
    adminId: string,
    dto: UpdateAdminBranchDto,
  ) {
    if (actor.role !== UserRole.MANAGER && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Manager access required");
    }
    const branch = dto.branch.trim();
    if (actor.role === UserRole.MANAGER && !actor.managedBranches.includes(branch)) {
      throw new ForbiddenException("Branch is outside your managed branches");
    }
    const target = await this.prisma.adminAccount.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, branch: true },
    });
    if (!target || target.role !== UserRole.ADMIN) {
      throw new BadRequestException("Admin account not found");
    }
    if (
      actor.role === UserRole.MANAGER &&
      target.branch &&
      !actor.managedBranches.includes(target.branch)
    ) {
      throw new ForbiddenException("Admin account is outside your managed branches");
    }
    const updated = await this.prisma.adminAccount.update({
      where: { id: adminId },
      data: { branch },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        branch: true,
      },
    });
    await this.logsService.safeRecord(
      this.logsService.audit(actor.id, "Admin branch assigned", {
        targetAdminId: updated.id,
        branch,
      }),
    );
    return updated;
  }

  async updateSettings(
    sessionId: string,
    settings: UpdateSettingsDto,
  ) {
    const session = await this.prisma.adminSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { adminId: true },
    });
    const account = await this.prisma.adminAccount.findUniqueOrThrow({
      where: { id: session.adminId },
    });
    if (!(await this.verifyPassword(settings.currentPassword, account.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = settings.newPassword
      ? await this.hashPassword(settings.newPassword)
      : account.passwordHash;

    await this.prisma.$transaction([
      this.prisma.adminAccount.update({
        where: { id: account.id },
        data: { username: settings.username, passwordHash },
      }),
      this.prisma.adminSession.deleteMany({ where: { adminId: account.id } }),
    ]);

    return { username: settings.username };
  }

  async logout(sessionId: string) {
    await this.prisma.adminSession.deleteMany({ where: { id: sessionId } });
  }

  private requireSuperAdmin(role: UserRole) {
    if (role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Super administrator access required");
    }
  }

  private async ensureAnotherActiveSuperAdmin(excludedId: string) {
    const count = await this.prisma.adminAccount.count({
      where: {
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        id: { not: excludedId },
      },
    });
    if (!count) {
      throw new BadRequestException("At least one active super administrator must remain");
    }
  }

  private async purgeExpiredAccounts() {
    try {
      const now = new Date();
      const expired = await this.prisma.adminAccount.findMany({
        where: { isActive: false, deleteAfter: { lte: now } },
        select: { id: true },
      });
      for (const account of expired) {
        try {
          await this.prisma.$transaction([
            this.prisma.applicationLog.create({
              data: {
                level: "WARNING",
                source: "BACKEND",
                message: "Scheduled account deletion completed",
                details: { targetUserId: account.id },
              },
            }),
            this.prisma.adminAccount.delete({ where: { id: account.id } }),
          ]);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Unable to permanently delete scheduled account ${account.id}: ${reason}`);
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Unable to scan scheduled account deletions: ${reason}`);
    }
  }

  private validateRoleAssignments(
    role: UserRole,
    branch?: string,
    managedBranches?: string[],
  ) {
    const branches = (managedBranches ?? []).map((managedBranch) => managedBranch.trim());
    if ((role === UserRole.EMPLOYEE || role === UserRole.ADMIN) && !branch?.trim()) {
      throw new BadRequestException("A branch is required for employees and admins");
    }
    if (role === UserRole.MANAGER && !branches.length) {
      throw new BadRequestException("At least one managed branch is required for managers");
    }
    if (branches.some((managedBranch) => !managedBranch) || new Set(branches).size !== branches.length) {
      throw new BadRequestException("Managed branches must be non-empty and unique");
    }
  }

  hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16);
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    const [algorithm, saltHex, keyHex] = storedHash.split("$");
    if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;
    const expectedKey = Buffer.from(keyHex, "hex");
    const actualKey = (await scrypt(
      password,
      Buffer.from(saltHex, "hex"),
      expectedKey.length,
    )) as Buffer;
    return (
      expectedKey.length === actualKey.length &&
      timingSafeEqual(expectedKey, actualKey)
    );
  }
}
