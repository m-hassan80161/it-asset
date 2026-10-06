import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { SESSION_DURATION_MS } from "./auth.constants";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

const scrypt = promisify(scryptCallback);
const ACCOUNT_ID = "admin";
const PASSWORD_MIN_LENGTH = 12;

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: ACCOUNT_ID },
    });
    if (account) return;

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
        passwordHash: await this.hashPassword(initialPassword),
      },
    });
  }

  async login(username: string, password: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { username },
    });
    if (!account || !(await this.verifyPassword(password, account.passwordHash))) {
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

  async getSettings() {
    const account = await this.prisma.adminAccount.findUniqueOrThrow({
      where: { id: ACCOUNT_ID },
      select: { username: true },
    });
    return account;
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
