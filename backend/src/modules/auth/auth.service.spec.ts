import { AuthProvider, UserRole } from "@prisma/client";
import { AuthService } from "./auth.service";
import { CompleteRegistrationDto } from "./dto/complete-registration.dto";
import { RequestRegistrationCodeDto } from "./dto/request-registration-code.dto";
import { EmailVerificationService } from "./email-verification.service";
import { LogsService } from "../logs/logs.service";
import { PrismaService } from "../../common/prisma/prisma.service";

describe("AuthService email registration", () => {
  const secret = "registration-secret-with-at-least-32-characters";
  let service: AuthService;
  let savedChallenge: Record<string, unknown> | null;
  let sentCode: string | undefined;
  let createAccount: jest.Mock;
  let updateAccount: jest.Mock;
  let incrementAttempts: jest.Mock;
  let legacyAccount: Record<string, unknown> | null;

  beforeEach(() => {
    savedChallenge = null;
    sentCode = undefined;
    legacyAccount = null;

    const challengeModel = {
      findUnique: jest.fn(async () => savedChallenge),
      upsert: jest.fn(async ({ create, update }) => {
        savedChallenge = { id: "challenge-id", ...create, ...update };
        return savedChallenge;
      }),
      deleteMany: jest.fn(async () => {
        const count = savedChallenge ? 1 : 0;
        savedChallenge = null;
        return { count };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    };

    createAccount = jest.fn(async ({ data }) => ({
      id: data.id,
      username: data.username,
      fullName: data.fullName,
      role: data.role,
      branch: data.branch,
    }));
    updateAccount = jest.fn(async ({ where, data }) => ({
      id: where.id,
      username: data.username,
      fullName: data.fullName,
      role: data.role,
      branch: data.branch,
    }));
    incrementAttempts = jest.fn(async () => ({ count: 1 }));

    const transaction = {
      emailVerificationChallenge: challengeModel,
      adminAccount: {
        findFirst: jest.fn(async () => legacyAccount),
        create: createAccount,
        update: updateAccount,
      },
      adminSession: { deleteMany: jest.fn() },
    };
    const prisma = {
      adminAccount: { findFirst: jest.fn(async () => legacyAccount) },
      emailVerificationChallenge: challengeModel,
      branch: {
        findMany: jest.fn(async ({ where }) =>
          where.name.in.map((name: string) => ({ name })),
        ),
      },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    challengeModel.updateMany = incrementAttempts;

    const config = { get: jest.fn(() => secret) };
    const logs = {
      audit: jest.fn(() => Promise.resolve()),
      safeRecord: jest.fn(() => Promise.resolve()),
    };
    const email = {
      sendRegistrationCode: jest.fn(async (_address: string, code: string) => {
        sentCode = code;
      }),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      config as never,
      logs as unknown as LogsService,
      email as unknown as EmailVerificationService,
    );
  });

  it("creates a verified registration as an employee and consumes the code", async () => {
    await service.requestRegistrationCode({
      email: "New.User@example.com",
    } satisfies RequestRegistrationCodeDto);
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(savedChallenge?.codeHash).not.toBe(sentCode);
    if (!sentCode) throw new Error("Email verification code was not sent");

    const result = await service.completeRegistration({
      email: "new.user@example.com",
      code: sentCode,
      fullName: "New User",
      password: "a-secure-password-123",
      branch: "Main",
    } satisfies CompleteRegistrationDto);

    expect(result.account.role).toBe(UserRole.EMPLOYEE);
    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: UserRole.EMPLOYEE,
          authProvider: AuthProvider.LOCAL,
          username: "new.user@example.com",
          branch: "Main",
        }),
      }),
    );
    expect(savedChallenge).toBeNull();
  });

  it("increments the attempt counter and rejects an incorrect code", async () => {
    await service.requestRegistrationCode({ email: "new.user@example.com" });
    const wrongCode = sentCode === "000000" ? "000001" : "000000";

    await expect(
      service.completeRegistration({
        email: "new.user@example.com",
        code: wrongCode,
        fullName: "New User",
        password: "a-secure-password-123",
        branch: "Main",
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(incrementAttempts).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { attempts: { increment: 1 } },
      }),
    );
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("converts a verified legacy cPanel employee without changing the saved branch", async () => {
    legacyAccount = {
      id: "legacy-account",
      username: "legacy@example.com",
      fullName: "legacy@example.com",
      phone: null,
      passwordHash: null,
      role: UserRole.EMPLOYEE,
      authProvider: AuthProvider.CPANEL,
      branch: "North",
      managedBranches: [],
      isActive: true,
      deleteAfter: null,
    };

    await service.requestRegistrationCode({ email: "legacy@example.com" });
    if (!sentCode) throw new Error("Email verification code was not sent");
    const result = await service.completeRegistration({
      email: "legacy@example.com",
      code: sentCode,
      fullName: "Legacy User",
      password: "a-secure-password-123",
      branch: "Main",
    });

    expect(result.account.role).toBe(UserRole.EMPLOYEE);
    expect(updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "legacy-account" },
        data: expect.objectContaining({
          role: UserRole.EMPLOYEE,
          authProvider: AuthProvider.LOCAL,
          branch: "North",
        }),
      }),
    );
    expect(createAccount).not.toHaveBeenCalled();
  });
});
