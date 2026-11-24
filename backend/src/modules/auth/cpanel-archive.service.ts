import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthenticatedUser } from "./authenticated-user";

@Injectable()
export class CpanelArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  async listAccounts(actor: AuthenticatedUser, prefix?: string, search?: string) {
    this.assertSupportStaff(actor);
    const normalizedPrefix = prefix?.trim();
    const normalizedSearch = search?.trim();
    const where = normalizedSearch
      ? {
          OR: [
            { username: { contains: normalizedSearch, mode: "insensitive" as const } },
            { domain: { contains: normalizedSearch, mode: "insensitive" as const } },
            { hostingAccountUsername: { contains: normalizedSearch, mode: "insensitive" as const } },
          ],
        }
      : normalizedPrefix
      ? { username: { startsWith: normalizedPrefix, mode: "insensitive" as const } }
      : undefined;
    const [exactMatch, matches] = await Promise.all([
      normalizedPrefix && !normalizedSearch
        ? this.prisma.cpanelAccount.findFirst({
            where: { username: { equals: normalizedPrefix, mode: "insensitive" } },
            include: {
              itamAccount: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  role: true,
                  branch: true,
                  isActive: true,
                  authProvider: true,
                },
              },
            },
          })
        : Promise.resolve(null),
      this.prisma.cpanelAccount.findMany({
        where,
        ...(normalizedPrefix && !normalizedSearch ? { take: 20 } : {}),
        orderBy: [{ status: "asc" }, { username: "asc" }],
        include: {
          itamAccount: {
            select: {
              id: true,
              username: true,
              fullName: true,
              role: true,
              branch: true,
              isActive: true,
              authProvider: true,
            },
          },
        },
      }),
    ]);
    return exactMatch
      ? [exactMatch, ...matches.filter((account) => account.username !== exactMatch.username)]
      : matches;
  }

  async addAccount(actor: AuthenticatedUser, email: string) {
    this.assertSupportStaff(actor);
    const username = email.trim().toLowerCase();
    const existing = await this.prisma.cpanelAccount.findUnique({ where: { username } });
    if (existing) throw new ConflictException("This email is already in cPanel Mails");

    try {
      return await this.prisma.cpanelAccount.create({
        data: {
          username,
          domain: username.slice(username.lastIndexOf("@") + 1),
          status: "MISSING",
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("This email is already in cPanel Mails");
      }
      throw error;
    }
  }

  async deleteAccount(actor: AuthenticatedUser, username: string) {
    this.assertSupportStaff(actor);
    const account = await this.prisma.cpanelAccount.findUnique({
      where: { username },
      select: { username: true },
    });
    if (!account) throw new NotFoundException("cPanel Mails record not found");
    await this.prisma.cpanelAccount.delete({ where: { username } });
    return { username: account.username };
  }

  private assertSupportStaff(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only support staff can access cPanel Mails");
    }
  }
}
