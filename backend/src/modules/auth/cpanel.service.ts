import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AuthProvider,
  BranchPatternSource,
  CpanelAccountStatus,
  UserRole,
} from "@prisma/client";
import axios from "axios";
import { AuthenticationFailure, ImapFlow } from "imapflow";
import * as https from "https";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LogsService } from "../logs/logs.service";

interface CpanelUapiResponse {
  data?: unknown;
  status?: number;
  errors?: unknown;
  warnings?: unknown;
  result?: {
    data?: unknown;
    status?: number;
    errors?: unknown;
    warnings?: unknown;
  };
}

interface SyncedMailbox {
  username: string;
  domain: string;
  hostingAccountUsername: string;
  status: CpanelAccountStatus;
}

const EMAIL_ADDRESS_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+$/;
const CPANEL_MAILBOX_LIST_PATH = "/execute/Email/list_pops";

@Injectable()
export class CpanelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CpanelService.name);
  private syncInterval?: ReturnType<typeof setInterval>;
  private syncInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logsService: LogsService,
  ) {}

  async onModuleInit() {
    if (!this.isSyncConfigured()) {
      this.logger.warn(
        "cPanel mailbox synchronization is disabled until CPANEL_URL and all per-account read-only API tokens are configured.",
      );
      return;
    }

    void this.syncAccounts().catch((error: unknown) => {
      this.logSyncFailure("Scheduled initial cPanel mailbox synchronization failed", error);
    });
    this.syncInterval = setInterval(() => {
      void this.syncAccounts().catch((error: unknown) => {
        this.logSyncFailure("Scheduled cPanel mailbox synchronization failed", error);
      });
    }, this.getSyncInterval());
    this.syncInterval.unref?.();
  }

  onModuleDestroy() {
    if (this.syncInterval) clearInterval(this.syncInterval);
  }

  async listAccounts() {
    return this.prisma.cpanelAccount.findMany({
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
    });
  }

  async syncAccounts(actorId?: string) {
    if (this.syncInProgress) {
      throw new ConflictException("A cPanel mailbox synchronization is already running");
    }
    const tokens = this.getApiTokens();
    this.syncInProgress = true;

    try {
      const mailboxes = await this.fetchMailboxes(tokens);
      if (!mailboxes.length) {
        throw new ServiceUnavailableException(
          "cPanel returned no mailboxes; existing mailbox statuses were left unchanged.",
        );
      }

      const syncedAt = new Date();
      const summary = await this.prisma.$transaction(async (transaction) => {
        const usernames = mailboxes.map(({ username }) => username);
        const existingCpanelAccounts = await transaction.cpanelAccount.findMany({
          where: { username: { in: usernames } },
          select: { username: true, itamAccountId: true },
        });
        const cpanelByUsername = new Map(
          existingCpanelAccounts.map((account) => [account.username, account]),
        );
        const existingItamAccounts = await transaction.adminAccount.findMany({
          where: { username: { in: usernames } },
          select: { id: true, username: true, authProvider: true, branch: true },
        });
        const itamByUsername = new Map(
          existingItamAccounts.map((account) => [account.username, account]),
        );
        const accountsToCreate: Array<{
          id: string;
          username: string;
          fullName: string;
          role: UserRole;
          authProvider: AuthProvider;
          branch: string | null;
        }> = [];
        const domainRules = await transaction.branchPattern.findMany({
          where: { source: BranchPatternSource.DOMAIN },
          select: { pattern: true, branch: true },
        });
        let discovered = 0;
        let provisioned = 0;
        let linked = 0;
        let usernameConflicts = 0;

        for (const mailbox of mailboxes) {
          const existingCpanelAccount = cpanelByUsername.get(mailbox.username);
          if (!existingCpanelAccount) discovered += 1;

          let itamAccountId = existingCpanelAccount?.itamAccountId ?? undefined;
          if (!itamAccountId) {
            const existingItamAccount = itamByUsername.get(mailbox.username);
            if (existingItamAccount?.authProvider === AuthProvider.CPANEL) {
              itamAccountId = existingItamAccount.id;
            } else if (existingItamAccount) {
              usernameConflicts += 1;
            } else {
              itamAccountId = randomUUID();
              accountsToCreate.push({
                id: itamAccountId,
                username: mailbox.username,
                fullName: mailbox.username,
                role: UserRole.EMPLOYEE,
                authProvider: AuthProvider.CPANEL,
                branch: this.resolveMailboxBranch(mailbox.domain, domainRules),
              });
              itamByUsername.set(mailbox.username, {
                id: itamAccountId,
                username: mailbox.username,
                authProvider: AuthProvider.CPANEL,
                branch: this.resolveMailboxBranch(mailbox.domain, domainRules),
              });
              provisioned += 1;
            }
          }

          if (itamAccountId) linked += 1;
        }

        if (accountsToCreate.length) {
          await transaction.adminAccount.createMany({ data: accountsToCreate });
        }

        for (const mailbox of mailboxes) {
          const existingCpanelAccount = cpanelByUsername.get(mailbox.username);
          const itamAccount = itamByUsername.get(mailbox.username);
          const itamAccountId = existingCpanelAccount?.itamAccountId ??
            (itamAccount?.authProvider === AuthProvider.CPANEL ? itamAccount.id : undefined);
          const matchedBranch = this.resolveMailboxBranch(mailbox.domain, domainRules);
          if (itamAccountId && matchedBranch && itamAccount?.branch == null) {
            await transaction.adminAccount.updateMany({
              where: { id: itamAccountId, branch: null, authProvider: AuthProvider.CPANEL },
              data: { branch: matchedBranch },
            });
          }

          await transaction.cpanelAccount.upsert({
            where: { username: mailbox.username },
            create: {
              username: mailbox.username,
              domain: mailbox.domain,
              hostingAccountUsername: mailbox.hostingAccountUsername,
              status: mailbox.status,
              lastSyncedAt: syncedAt,
              lastSeenAt: syncedAt,
              ...(itamAccountId ? { itamAccountId } : {}),
            },
            update: {
              domain: mailbox.domain,
              hostingAccountUsername: mailbox.hostingAccountUsername,
              status: mailbox.status,
              lastSyncedAt: syncedAt,
              lastSeenAt: syncedAt,
              ...(itamAccountId ? { itamAccountId } : {}),
            },
          });
        }
        const active = mailboxes.filter(({ status }) => status === CpanelAccountStatus.ACTIVE).length;
        const suspended = mailboxes.length - active;
        return {
          discovered,
          active,
          suspended,
          missing: 0,
          provisioned,
          linked,
          usernameConflicts,
        };
      });

      const details = { ...summary, syncedAt: syncedAt.toISOString() };
      await this.logsService.safeRecord(
        actorId
          ? this.logsService.audit(actorId, "cPanel mailboxes synchronized", details)
          : this.logsService.info("Scheduled cPanel mailboxes synchronized", details),
      );
      return { ...summary, syncedAt };
    } finally {
      this.syncInProgress = false;
    }
  }

  async linkExistingAccount(
    _mailboxAddress: string,
    _itamAccountId: string,
    _actorId: string,
  ) {
    throw new ServiceUnavailableException(
      "Manual mailbox linking is unavailable. Sync provisions accounts automatically; resolve reported username conflicts first.",
    );
  }

  async createEmployeeAccount(
    _mailboxAddress: string,
    _branch: string,
    _actorId: string,
  ) {
    throw new ServiceUnavailableException(
      "ITAM mailbox accounts are provisioned by synchronization; cPanel mailbox creation is not supported.",
    );
  }

  async verifyMailboxPassword(emailAddress: string, password: string): Promise<boolean> {
    const username = emailAddress.trim().toLowerCase();
    if (
      !EMAIL_ADDRESS_PATTERN.test(username) ||
      username.length > 254 ||
      !password ||
      password.length > 256
    ) {
      return false;
    }

    const mailbox = await this.prisma.cpanelAccount.findUnique({
      where: { username },
      select: { status: true, itamAccountId: true },
    });
    if (!mailbox || mailbox.status !== CpanelAccountStatus.ACTIVE || !mailbox.itamAccountId) {
      return false;
    }

    const host = this.getImapHost();
    const timeout = this.getTimeout();
    const client = new ImapFlow({
      host,
      port: 993,
      secure: true,
      auth: { user: username, pass: password },
      logger: false,
      socketTimeout: timeout,
      greetingTimeout: timeout,
      tls: { servername: host, rejectUnauthorized: true },
    });

    try {
      await client.connect();
      await client.logout();
      return true;
    } catch (error) {
      if (
        error instanceof AuthenticationFailure ||
        (error instanceof Error &&
          "authenticationFailed" in error &&
          error.authenticationFailed === true)
      ) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Mailbox IMAP verification unavailable for ${host}: ${message}`);
      throw new ServiceUnavailableException("Mailbox authentication service is unavailable");
    }
  }

  private isSyncConfigured() {
    try {
      return Boolean(this.config.get<string>("CPANEL_URL")) &&
        this.getApiTokens().size > 0;
    } catch {
      return false;
    }
  }

  private getApiTokens() {
    const value = this.config.get<string>("CPANEL_API_TOKENS_JSON");
    if (!value) {
      throw new ServiceUnavailableException("CPANEL_API_TOKENS_JSON is not configured");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ServiceUnavailableException("CPANEL_API_TOKENS_JSON must be a valid JSON object");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ServiceUnavailableException("CPANEL_API_TOKENS_JSON must map cPanel usernames to tokens");
    }

    const tokens = Object.entries(parsed);
    if (!tokens.length) {
      throw new ServiceUnavailableException("CPANEL_API_TOKENS_JSON must include every cPanel hosting account");
    }
    const result = new Map<string, string>();
    for (const [username, token] of tokens) {
      if (
        !/^[a-zA-Z0-9_]{1,32}$/.test(username) ||
        typeof token !== "string" ||
        !token.trim() ||
        /[\r\n]/.test(token)
      ) {
        throw new ServiceUnavailableException(
          "CPANEL_API_TOKENS_JSON contains an invalid username or token value",
        );
      }
      result.set(username, token);
    }
    return result;
  }

  private resolveMailboxBranch(
    domain: string,
    rules: Array<{ pattern: string; branch: string }>,
  ) {
    const normalizedDomain = domain.toLocaleLowerCase();
    return rules
      .filter((rule) => normalizedDomain.includes(rule.pattern.toLocaleLowerCase()))
      .sort((a, b) => b.pattern.length - a.pattern.length)[0]?.branch ?? null;
  }

  private async fetchMailboxes(tokens: Map<string, string>): Promise<SyncedMailbox[]> {
    const baseUrl = this.getCpanelBaseUrl();
    const mailboxes: SyncedMailbox[] = [];
    const seen = new Set<string>();

    for (const [hostingAccountUsername, token] of tokens) {
      const endpoint = new URL(CPANEL_MAILBOX_LIST_PATH, baseUrl).toString();
      const timeout = this.getTimeout();

      try {
        const response = await axios.get<CpanelUapiResponse>(endpoint, {
          headers: {
            Authorization: `cpanel ${hostingAccountUsername}:${token}`,
            Accept: "application/json",
          },
          timeout,
          validateStatus: () => true,
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        });

        if (response.status !== 200) {
          throw new ServiceUnavailableException(
            `cPanel mailbox API request failed with HTTP ${response.status} for hosting account ${hostingAccountUsername}`,
          );
        }

        const payload = response.data;
        const result = payload.result ?? payload;
        if (result.status !== undefined && result.status !== 1) {
          throw new ServiceUnavailableException(
            `cPanel mailbox listing failed for hosting account ${hostingAccountUsername}: ${this.getApiReason(result.errors ?? result.warnings)}`,
          );
        }
        if (!Array.isArray(result.data)) {
          throw new ServiceUnavailableException(
            `cPanel mailbox list is missing for hosting account ${hostingAccountUsername}`,
          );
        }

        for (const [index, item] of result.data.entries()) {
          const row = item && typeof item === "object"
            ? item as Record<string, unknown>
            : null;
          const domain = typeof row?.domain === "string" ? row.domain.trim() : null;
          const candidates = typeof item === "string"
            ? [item]
            : row
              ? [
                row.email,
                row.login,
                ...(domain
                  ? [
                    typeof row.email === "string" && !row.email.includes("@")
                      ? `${row.email}@${domain}`
                      : null,
                    typeof row.login === "string" && !row.login.includes("@")
                      ? `${row.login}@${domain}`
                      : null,
                  ]
                  : []),
              ].filter((candidate): candidate is string => typeof candidate === "string")
              : [];

          const address = candidates
            .map((candidate) => candidate.trim())
            .find((candidate) => this.getMailboxAddressError(candidate) === null);

          if (!address) {
            this.logger.warn(
              `Skipping invalid cPanel mailbox row ${index + 1} for hosting account ${hostingAccountUsername}. ` +
              `email=${typeof row?.email === "string" ? this.getMailboxAddressError(row.email.trim()) ?? "valid" : `not-a-string(${typeof row?.email})`}; ` +
              `login=${typeof row?.login === "string" ? this.getMailboxAddressError(row.login.trim()) ?? "valid" : `not-a-string(${typeof row?.login})`}; ` +
              `domainType=${typeof row?.domain}`,
            );
            continue;
          }

          const username = address.toLowerCase();
          if (seen.has(username)) {
            this.logger.warn(`Skipping duplicate mailbox identity: ${username}`);
            continue;
          }
          seen.add(username);
          mailboxes.push({
            username,
            domain: username.slice(username.lastIndexOf("@") + 1),
            hostingAccountUsername,
            status: this.isMailboxLoginSuspended(row?.suspended_login)
              ? CpanelAccountStatus.SUSPENDED
              : CpanelAccountStatus.ACTIVE,
          });
        }
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        throw new ServiceUnavailableException(
          `Unable to reach cPanel mailbox API for hosting account ${hostingAccountUsername}: ${message}`,
        );
      }
    }
    return mailboxes;
  }

  private getMailboxAddressError(address: string): string | null {
    if (!address) return "empty";
    if (address.length > 254) return `too-long (${address.length} characters)`;
    if (/\s|[,;<>]/.test(address)) return "contains-whitespace-or-separator";

    const separator = address.indexOf("@");
    if (separator === -1) return "missing-at-sign";
    if (separator !== address.lastIndexOf("@")) return "multiple-at-signs";
    if (separator === 0) return "missing-local-part";
    if (separator === address.length - 1) return "missing-domain";
    if (!EMAIL_ADDRESS_PATTERN.test(address)) return "invalid-address-format";
    return null;
  }

  private isMailboxLoginSuspended(value: unknown) {
    return value === true || value === 1 || value === "1";
  }

  private getImapHost() {
    const configuredHost = this.config.get<string>("CPANEL_IMAP_HOST")?.trim();
    if (configuredHost) {
      if (
        configuredHost.includes("://") ||
        configuredHost.includes("/") ||
        configuredHost.includes("@") ||
        configuredHost.includes(":")
      ) {
        throw new ServiceUnavailableException(
          "CPANEL_IMAP_HOST must be a hostname without a scheme, port, or path",
        );
      }
      return configuredHost;
    }

    return this.getCpanelBaseUrl().hostname;
  }

  private getCpanelBaseUrl() {
    const configuredUrl = this.config.get<string>("CPANEL_URL");
    if (!configuredUrl) {
      throw new ServiceUnavailableException("CPANEL_URL is not configured");
    }
    let base: URL;
    try {
      base = new URL(configuredUrl);
    } catch {
      throw new ServiceUnavailableException("CPANEL_URL must be a valid HTTPS URL");
    }
    if (
      base.protocol !== "https:" ||
      base.port !== "2083" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      (base.pathname !== "/" && base.pathname !== "")
    ) {
      throw new ServiceUnavailableException("CPANEL_URL must use HTTPS on port 2083 without a path");
    }
    return base;
  }

  private getApiReason(errors: unknown) {
    if (Array.isArray(errors)) {
      const safeErrors = errors
        .filter((error): error is string => typeof error === "string")
        .map((error) => error.replace(/[\r\n\t]/g, " ").slice(0, 200));
      if (safeErrors.length) return safeErrors.join("; ");
    }
    return "the API did not provide a reason";
  }

  private getTimeout() {
    const timeout = Number(this.config.get<string>("CPANEL_API_TIMEOUT_MS") ?? 8000);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) {
      throw new ServiceUnavailableException("CPANEL_API_TIMEOUT_MS must be between 1000 and 30000");
    }
    return timeout;
  }

  private getSyncInterval() {
    const interval = Number(this.config.get<string>("CPANEL_SYNC_INTERVAL_MS") ?? 3600000);
    if (!Number.isInteger(interval) || interval < 60000) {
      throw new ServiceUnavailableException("CPANEL_SYNC_INTERVAL_MS must be at least 60000");
    }
    return interval;
  }

  private logSyncFailure(message: string, error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`${message}: ${reason}`);
  }
}
