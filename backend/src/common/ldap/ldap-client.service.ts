import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "ldapts";

export interface LdapSearchOptions {
  baseDn?: string;
  filter: string;
  attributes?: string[];
  scope?: "base" | "one" | "sub";
}

@Injectable()
export class LdapClientService {
  private readonly logger = new Logger(LdapClientService.name);

  constructor(private readonly config: ConfigService) {}

  private createClient(): Client {
    const url = this.config.get<string>("AD_URL") || "";
    const rejectUnauthorized = this.config.get<string>("AD_REJECT_UNAUTHORIZED") !== "false";
    return new Client({
      url,
      tlsOptions: { rejectUnauthorized },
    });
  }

  /**
   * Binds with the service account, runs one search, unbinds.
   * Short-lived connections keep this safe to call concurrently from
   * multiple sync jobs without juggling a shared connection pool.
   */
  async search(options: LdapSearchOptions) {
    const client = this.createClient();
    const bindDn = this.config.get<string>("AD_BIND_DN") || "";
    const bindPassword = this.config.get<string>("AD_BIND_PASSWORD") || "";
    const baseDn = options.baseDn ?? this.config.get<string>("AD_BASE_DN") ?? "";

    try {
      await client.bind(bindDn, bindPassword);
      const { searchEntries } = await client.search(baseDn, {
        filter: options.filter,
        attributes: options.attributes,
        scope: options.scope ?? "sub",
        paged: true,
      });
      return searchEntries;
    } catch (err: any) {
      this.logger.error(`LDAP search failed: ${err.message}`);
      throw err;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async testConnection(): Promise<boolean> {
    const client = this.createClient();
    const bindDn = this.config.get<string>("AD_BIND_DN") || "";
    const bindPassword = this.config.get<string>("AD_BIND_PASSWORD") || "";
    try {
      await client.bind(bindDn, bindPassword);
      return true;
    } catch (err: any) {
      this.logger.error(`LDAP bind failed: ${err.message}`);
      return false;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}