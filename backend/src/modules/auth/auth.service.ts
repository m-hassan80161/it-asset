import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  createHmac,
  createHash,
  randomInt,
  randomUUID,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { REMEMBERED_SESSION_DURATION_MS, SESSION_DURATION_MS } from "./auth.constants";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { CreateLocalUserDto } from "./dto/create-local-user.dto";
import { AuthProvider, Prisma, UserRole } from "@prisma/client";
import { AuthenticatedUser } from "./authenticated-user";
import { UpdateAdminBranchDto } from "./dto/update-admin-branch.dto";
import { LogsService } from "../logs/logs.service";
import { UpdateLocalUserDto } from "./dto/update-local-user.dto";
import { RequestRegistrationCodeDto } from "./dto/request-registration-code.dto";
import { CompleteRegistrationDto } from "./dto/complete-registration.dto";
import { EmailVerificationService } from "./email-verification.service";

const scrypt = promisify(scryptCallback);
const ACCOUNT_ID = "admin";
const PASSWORD_MIN_LENGTH = 12;
const ACCOUNT_PURGE_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const REGISTRATION_CODE_TTL_MS = 10 * 60 * 1000;
const REGISTRATION_RESEND_DELAY_MS = 60 * 1000;
const REGISTRATION_SEND_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_SEND_LIMIT = 3;
const REGISTRATION_ATTEMPT_LIMIT = 5;
const REGISTRATION_RESPONSE =
  "If this email address can be registered, a verification code will be sent.";

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private purgeInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logsService: LogsService,
    private readonly emailVerificationService: EmailVerificationService,
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

  async login(username: string, password: string, rememberMe = false) {
    const normalizedUsername = username.trim().includes("@")
      ? username.trim().toLowerCase()
      : username.trim();
    const account = await this.prisma.adminAccount.findUnique({
      where: { username: normalizedUsername },
    });
    if (!account || !account.isActive) {
      throw new UnauthorizedException("Invalid username or password");
    }
    if (!(await this.verifyPassword(password, account.passwordHash))) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() +
      (rememberMe ? REMEMBERED_SESSION_DURATION_MS : SESSION_DURATION_MS));
    await this.prisma.adminSession.create({
      data: {
        adminId: account.id,
        tokenHash: this.hashToken(token),
        expiresAt,
      },
    });

    return { token, expiresAt, username: account.username };
  }

  async listRegistrationBranches() {
    return this.prisma.branch.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    });
  }

  async requestRegistrationCode(dto: RequestRegistrationCodeDto) {
    const email = dto.email.trim().toLowerCase();
    const existingAccount = await this.prisma.adminAccount.findFirst({
      where: { username: { equals: email, mode: "insensitive" } },
      select: {
        role: true,
        authProvider: true,
        passwordHash: true,
        isActive: true,
      },
    });
    const canClaimLegacyAccount =
      existingAccount?.authProvider === AuthProvider.CPANEL &&
      existingAccount.role === UserRole.EMPLOYEE &&
      existingAccount.passwordHash === null &&
      existingAccount.isActive;
    if (existingAccount && !canClaimLegacyAccount) {
      return { message: REGISTRATION_RESPONSE };
    }

    const secret = this.registrationSecret();
    const now = new Date();
    const existingChallenge =
      await this.prisma.emailVerificationChallenge.findUnique({ where: { email } });
    if (
      existingChallenge &&
      now.getTime() - existingChallenge.lastSentAt.getTime() < REGISTRATION_RESEND_DELAY_MS
    ) {
      throw new HttpException(
        "Please wait before requesting another code.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const withinWindow =
      existingChallenge &&
      now.getTime() - existingChallenge.windowStartedAt.getTime() < REGISTRATION_SEND_WINDOW_MS;
    const sendsInWindow = withinWindow ? existingChallenge.sendsInWindow : 0;
    if (sendsInWindow >= REGISTRATION_SEND_LIMIT) {
      throw new HttpException(
        "Too many codes requested. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000);
    const codeText = code.toString().padStart(6, "0");
    const challenge = {
      codeHash: this.registrationCodeHash(secret, email, codeText),
      expiresAt: new Date(now.getTime() + REGISTRATION_CODE_TTL_MS),
      lastSentAt: now,
      windowStartedAt: withinWindow ? existingChallenge.windowStartedAt : now,
      sendsInWindow: sendsInWindow + 1,
      attempts: 0,
    };

    await this.prisma.emailVerificationChallenge.upsert({
      where: { email },
      create: { email, ...challenge },
      update: challenge,
    });
    await this.emailVerificationService.sendRegistrationCode(email, codeText);
    return { message: REGISTRATION_RESPONSE };
  }

  async completeRegistration(dto: CompleteRegistrationDto) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    if (!fullName) {
      throw new BadRequestException("A full name is required.");
    }
    const challenge = await this.prisma.emailVerificationChallenge.findUnique({
      where: { email },
    });
    const now = new Date();
    if (!challenge || challenge.expiresAt <= now) {
      if (challenge) {
        await this.prisma.emailVerificationChallenge.deleteMany({
          where: { id: challenge.id, codeHash: challenge.codeHash },
        });
      }
      throw new UnauthorizedException("The verification code is invalid or expired.");
    }
    if (challenge.attempts >= REGISTRATION_ATTEMPT_LIMIT) {
      throw new HttpException(
        "Too many incorrect codes. Request a new code.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const secret = this.registrationSecret();
    if (!this.matchesRegistrationCode(secret, email, dto.code, challenge.codeHash)) {
      const attempt = await this.prisma.emailVerificationChallenge.updateMany({
        where: {
          id: challenge.id,
          codeHash: challenge.codeHash,
          attempts: { lt: REGISTRATION_ATTEMPT_LIMIT },
        },
        data: { attempts: { increment: 1 } },
      });
      if (!attempt.count) {
        const latestChallenge =
          await this.prisma.emailVerificationChallenge.findUnique({ where: { email } });
        if (latestChallenge && latestChallenge.codeHash !== challenge.codeHash) {
          throw new UnauthorizedException("The verification code is invalid or expired.");
        }
        throw new HttpException(
          "Too many incorrect codes. Request a new code.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException("The verification code is invalid or expired.");
    }

    const passwordHash = await this.hashPassword(dto.password);
    const account = await this.prisma.$transaction(async (transaction) => {
      const currentChallenge =
        await transaction.emailVerificationChallenge.findUnique({ where: { email } });
      if (
        !currentChallenge ||
        currentChallenge.expiresAt <= new Date() ||
        currentChallenge.attempts >= REGISTRATION_ATTEMPT_LIMIT ||
        !this.matchesRegistrationCode(
          secret,
          email,
          dto.code,
          currentChallenge.codeHash,
        )
      ) {
        throw new UnauthorizedException("The verification code is invalid or expired.");
      }
      const consumed = await transaction.emailVerificationChallenge.deleteMany({
        where: { id: currentChallenge.id },
      });
      if (!consumed.count) {
        throw new UnauthorizedException("The verification code is invalid or expired.");
      }

      const existing = await transaction.adminAccount.findFirst({
        where: { username: { equals: email, mode: "insensitive" } },
      });
      if (
        existing &&
        (existing.authProvider !== AuthProvider.CPANEL ||
          existing.role !== UserRole.EMPLOYEE ||
          existing.passwordHash !== null ||
          !existing.isActive)
      ) {
        throw new ConflictException("An account already exists for this email address.");
      }

      const branch = existing?.branch ?? dto.branch.trim();
      await this.validateConfiguredBranches(UserRole.EMPLOYEE, branch);
      const accountData = {
        username: email,
        fullName,
        phone: dto.phone?.trim() || null,
        passwordHash,
        role: UserRole.EMPLOYEE,
        authProvider: AuthProvider.LOCAL,
        branch,
        managedBranches: [],
        isActive: true,
        deleteAfter: null,
      };

      const registeredAccount = existing
        ? await transaction.adminAccount.update({
            where: { id: existing.id },
            data: accountData,
            select: {
              id: true,
              username: true,
              fullName: true,
              role: true,
              branch: true,
            },
          })
        : await transaction.adminAccount.create({
            data: { id: randomUUID(), ...accountData },
            select: {
              id: true,
              username: true,
              fullName: true,
              role: true,
              branch: true,
            },
          });

      await transaction.adminSession.deleteMany({ where: { adminId: registeredAccount.id } });
      return registeredAccount;
    });

    await this.logsService.safeRecord(
      this.logsService.audit(account.id, "Account registered via email verification", {
        role: account.role,
        branch: account.branch,
      }),
    );
    return { status: "created", account };
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
        phone: true,
        role: true,
        authProvider: true,
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
        phone: true,
        role: true,
        authProvider: true,
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
    await this.validateConfiguredBranches(dto.role, dto.branch, dto.managedBranches);
    if (await this.prisma.adminAccount.findUnique({ where: { username: dto.username } })) {
      throw new ConflictException("Username is already in use");
    }
    const account = await this.prisma.adminAccount.create({
      data: {
        id: randomUUID(),
        username: dto.username,
        fullName: dto.fullName,
        phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
        passwordHash: await this.hashPassword(dto.password),
        role: dto.role,
        branch: dto.branch?.trim(),
        managedBranches: (dto.managedBranches ?? []).map((branch) => branch.trim()),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        phone: true,
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
    if (
      target.authProvider === AuthProvider.CPANEL &&
      !target.passwordHash &&
      dto.username !== undefined &&
      dto.username.trim() !== target.username &&
      !dto.password
    ) {
      throw new BadRequestException(
        "Set a local password before changing the username of a legacy account.",
      );
    }

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
      await this.validateConfiguredBranches(newRole, newBranch ?? undefined, newManagedBranches);
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
    const useLocalCredentials =
      Boolean(passwordHash) ||
      (username !== undefined &&
        username !== target.username &&
        Boolean(target.passwordHash));
    const updated = await this.prisma.$transaction(async (transaction) => {
      const account = await transaction.adminAccount.update({
        where: { id: target.id },
        data: {
          username,
          fullName: dto.fullName?.trim(),
          phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
          passwordHash,
          ...(useLocalCredentials ? { authProvider: AuthProvider.LOCAL } : {}),
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
          phone: true,
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
      if (dto.isActive === false) {
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
        data: {
          username: settings.username,
          passwordHash,
          authProvider: AuthProvider.LOCAL,
        },
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

  private registrationSecret() {
    const secret = this.config.get<string>("EMAIL_VERIFICATION_SECRET");
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        "Set EMAIL_VERIFICATION_SECRET to a random value of at least 32 characters.",
      );
    }
    return secret;
  }

  private registrationCodeHash(secret: string, email: string, code: string) {
    return createHmac("sha256", secret).update(`${email}\0${code}`).digest("hex");
  }

  private matchesRegistrationCode(
    secret: string,
    email: string,
    code: string,
    storedHash: string,
  ) {
    const expected = Buffer.from(storedHash, "hex");
    const actual = Buffer.from(this.registrationCodeHash(secret, email, code), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
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

  private async validateConfiguredBranches(
    role: UserRole,
    branch?: string,
    managedBranches?: string[],
  ) {
    const assignedBranches = role === UserRole.MANAGER
      ? (managedBranches ?? []).map((value) => value.trim())
      : role === UserRole.EMPLOYEE || role === UserRole.ADMIN
        ? [branch?.trim() ?? ""]
        : [];
    if (!assignedBranches.length) return;
    const configured = await this.prisma.branch.findMany({
      where: { name: { in: assignedBranches } },
      select: { name: true },
    });
    if (configured.length !== new Set(assignedBranches).size) {
      throw new BadRequestException("Assigned branches must be selected from the configured branch list");
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

  private async verifyPassword(password: string, storedHash: string | null) {
    if (!storedHash) return false;
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
