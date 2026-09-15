import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, Attribute, Change } from "ldapts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LdapClientService } from "../../common/ldap/ldap-client.service";

export interface CreateAdUserInput {
  firstName: string;
  lastName: string;
  username: string; // sAMAccountName
  email: string;
  password: string;
  targetOuDn: string;
}

/** Converts a shell-style pattern ("Admin_*") into a RegExp. */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

@Injectable()
export class ActiveDirectoryService {
  private readonly logger = new Logger(ActiveDirectoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ldap: LdapClientService,
    private readonly config: ConfigService,
  ) {}

  private getExcludedOuPatterns(): RegExp[] {
    const raw = this.config.get<string>("AD_EXCLUDED_OU_PATTERNS") ?? "";
    return raw.split(",").filter(Boolean).map(patternToRegex);
  }

  private getExcludedAccountPatterns(): RegExp[] {
    const raw = this.config.get<string>("AD_EXCLUDED_ACCOUNT_PATTERNS") ?? "";
    return raw.split(",").filter(Boolean).map(patternToRegex);
  }

  private isDnExcluded(dn: string, patterns: RegExp[]): boolean {
    return patterns.some((re) => re.test(dn));
  }

  // -------------------------------------------------------------------
  // OU SYNC
  // -------------------------------------------------------------------
  async syncOrganizationalUnits() {
    const entries = await this.ldap.search({
      filter: "(objectClass=organizationalUnit)",
      attributes: ["ou", "distinguishedName"],
    });

    const excludedPatterns = this.getExcludedOuPatterns();
    let count = 0;

    for (const entry of entries) {
      const dn = String(entry.dn);
      const name = String(entry.ou ?? dn.split(",")[0].replace("OU=", ""));
      const excluded = this.isDnExcluded(dn, excludedPatterns);

      await this.prisma.adOrganizationalUnit.upsert({
        where: { distinguishedName: dn },
        create: { distinguishedName: dn, name, excluded, lastSyncedAt: new Date() },
        update: { name, excluded, lastSyncedAt: new Date() },
      });
      count++;
    }
    this.logger.log(`Synced ${count} OUs`);
    return { count };
  }

  // -------------------------------------------------------------------
  // GROUP SYNC
  // -------------------------------------------------------------------
  async syncGroups() {
    const entries = await this.ldap.search({
      filter: "(objectClass=group)",
      attributes: ["cn", "description", "distinguishedName"],
    });

    const excludedPatterns = this.getExcludedOuPatterns();
    let count = 0;

    for (const entry of entries) {
      const dn = String(entry.dn);
      const excluded = this.isDnExcluded(dn, excludedPatterns);

      await this.prisma.adGroup.upsert({
        where: { distinguishedName: dn },
        create: {
          distinguishedName: dn,
          name: String(entry.cn),
          description: entry.description ? String(entry.description) : null,
          excluded,
          lastSyncedAt: new Date(),
        },
        update: {
          name: String(entry.cn),
          description: entry.description ? String(entry.description) : null,
          excluded,
          lastSyncedAt: new Date(),
        },
      });
      count++;
    }
    this.logger.log(`Synced ${count} groups`);
    return { count };
  }

  // -------------------------------------------------------------------
  // USER SYNC (+ manager hierarchy, service-account detection)
  // -------------------------------------------------------------------
  async syncUsers() {
    const entries = await this.ldap.search({
      filter: "(&(objectClass=user)(objectCategory=person))",
      attributes: [
        "sAMAccountName",
        "givenName",
        "sn",
        "mail",
        "manager",
        "distinguishedName",
        "memberOf",
      ],
    });

    const excludedOuPatterns = this.getExcludedOuPatterns();
    const excludedAccountPatterns = this.getExcludedAccountPatterns();
    let count = 0;

    // Pass 1: upsert users without manager FK (manager DN may not exist yet)
    for (const entry of entries) {
      const dn = String(entry.dn);
      const sam = String(entry.sAMAccountName ?? "");
      if (!sam) continue;

      const isServiceAccount = this.isDnExcluded(sam, excludedAccountPatterns);
      const excludedByOu = this.isDnExcluded(dn, excludedOuPatterns);

      const ou = await this.prisma.adOrganizationalUnit.findFirst({
        where: { distinguishedName: dn.substring(dn.indexOf(",") + 1) },
      });

      await this.prisma.adUser.upsert({
        where: { distinguishedName: dn },
        create: {
          distinguishedName: dn,
          sAMAccountName: sam,
          firstName: entry.givenName ? String(entry.givenName) : null,
          lastName: entry.sn ? String(entry.sn) : null,
          email: entry.mail ? String(entry.mail) : null,
          managerDn: entry.manager ? String(entry.manager) : null,
          ouId: ou?.id,
          isServiceAccount,
          excluded: isServiceAccount || excludedByOu,
          lastSyncedAt: new Date(),
        },
        update: {
          firstName: entry.givenName ? String(entry.givenName) : null,
          lastName: entry.sn ? String(entry.sn) : null,
          email: entry.mail ? String(entry.mail) : null,
          managerDn: entry.manager ? String(entry.manager) : null,
          ouId: ou?.id,
          isServiceAccount,
          excluded: isServiceAccount || excludedByOu,
          lastSyncedAt: new Date(),
        },
      });

      // group memberships
      const groupDns: string[] = Array.isArray(entry.memberOf)
        ? entry.memberOf.map(String)
        : entry.memberOf
        ? [String(entry.memberOf)]
        : [];

      const user = await this.prisma.adUser.findUnique({ where: { distinguishedName: dn } });
      if (user) {
        await this.prisma.adUserGroup.deleteMany({ where: { userId: user.id } });
        for (const gDn of groupDns) {
          const group = await this.prisma.adGroup.findUnique({ where: { distinguishedName: gDn } });
          if (group) {
            await this.prisma.adUserGroup.create({ data: { userId: user.id, groupId: group.id } });
          }
        }
      }

      count++;
    }

    this.logger.log(`Synced ${count} users (manager hierarchy resolved via managerDn FK)`);
    return { count };
  }

  async fullSync() {
    await this.syncOrganizationalUnits();
    await this.syncGroups();
    await this.syncUsers();
    return { status: "ok", syncedAt: new Date() };
  }

  /** Department Head = walk manager chain until a user has no manager within the same OU tree, or depth limit. */
  async getOrgHierarchy(userDn: string, maxDepth = 5) {
    const chain: any[] = [];
    let current = await this.prisma.adUser.findUnique({ where: { distinguishedName: userDn } });
    let depth = 0;
    while (current?.managerDn && depth < maxDepth) {
      const manager = await this.prisma.adUser.findUnique({ where: { distinguishedName: current.managerDn } });
      if (!manager) break;
      chain.push(manager);
      current = manager;
      depth++;
    }
    return chain;
  }

  async listUsers(includeExcluded = false) {
    return this.prisma.adUser.findMany({
      where: includeExcluded ? {} : { excluded: false },
      include: { ou: true, groups: { include: { group: true } } },
      orderBy: { lastName: "asc" },
    });
  }

  async listGroups(includeExcluded = false) {
    return this.prisma.adGroup.findMany({ where: includeExcluded ? {} : { excluded: false } });
  }

  async listOus(includeExcluded = false) {
    return this.prisma.adOrganizationalUnit.findMany({ where: includeExcluded ? {} : { excluded: false } });
  }

  // -------------------------------------------------------------------
  // WRITE OPERATIONS — used by the onboarding workflow
  // NOTE: password-set (unicodePwd) and userAccountControl changes
  // REQUIRE LDAPS (ldaps://) — plaintext LDAP will be rejected by AD.
  // -------------------------------------------------------------------

  private async bindWriteClient(): Promise<Client> {
    const url = this.config.get<string>("AD_URL") ?? "";
    const rejectUnauthorized = this.config.get<string>("AD_REJECT_UNAUTHORIZED") !== "false";
    const client = new Client({ url, tlsOptions: { rejectUnauthorized } });
    await client.bind(
      this.config.get<string>("AD_BIND_DN") ?? "",
      this.config.get<string>("AD_BIND_PASSWORD") ?? "",
    );
    return client;
  }

  /** Step 1 of onboarding: create the AD user object inside the chosen OU. */
  async createUser(input: CreateAdUserInput): Promise<string> {
    const client = await this.bindWriteClient();
    const userDn = `CN=${input.firstName} ${input.lastName},${input.targetOuDn}`;

    try {
      await client.add(userDn, {
        objectClass: ["top", "person", "organizationalPerson", "user"],
        cn: `${input.firstName} ${input.lastName}`,
        sn: input.lastName,
        givenName: input.firstName,
        sAMAccountName: input.username,
        userPrincipalName: `${input.username}@${this.config.get<string>("AD_DOMAIN_SUFFIX") ?? "corp.local"}`,
        mail: input.email,
        // Disabled (66050 = NORMAL_ACCOUNT + ACCOUNTDISABLE) until password is set below
        userAccountControl: "66050",
      } as any);

      // Password must be set via unicodePwd (UTF-16LE, quoted) over LDAPS
      const encodedPwd = Buffer.from(`"${input.password}"`, "utf16le");
      await client.modify(userDn, [
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "unicodePwd", values: [encodedPwd] }),
        }),
        // Enable the account now that a password is set (512 = NORMAL_ACCOUNT, enabled)
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "userAccountControl", values: ["512"] }),
        }),
      ]);

      this.logger.log(`Created AD user ${userDn}`);
      return userDn;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  /** Step 2 of onboarding: add to groups + set manager attribute. */
  async addUserToGroupsAndSetManager(userDn: string, groupDns: string[], managerDn?: string) {
    const client = await this.bindWriteClient();
    try {
      for (const groupDn of groupDns) {
        await client.modify(groupDn, [
          new Change({
            operation: "add",
            modification: new Attribute({ type: "member", values: [userDn] }),
          }),
        ]);
      }

      if (managerDn) {
        await client.modify(userDn, [
          new Change({
            operation: "replace",
            modification: new Attribute({ type: "manager", values: [managerDn] }),
          }),
        ]);
      }
      this.logger.log(`Assigned ${groupDns.length} group(s) and manager to ${userDn}`);
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}
