import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface WinRmExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

let WinRM: any;

try {
  // Try to load node-winrm if available
  WinRM = require("node-winrm");
} catch (err) {
  // If not available, create a mock that throws error on use
  WinRM = {
    run: async () => {
      throw new Error(
        "WinRM module not available. Install node-winrm or configure Windows File Server integration.",
      );
    },
  };
}

@Injectable()
export class WinRmService {
  private readonly logger = new Logger(WinRmService.name);

  private getConnectionOptions() {
    return {
      host: this.config.get<string>("FILESERVER_HOST"),
      port: Number(this.config.get<string>("FILESERVER_WINRM_PORT") ?? 5986),
      username: this.config.get<string>("FILESERVER_WINRM_USERNAME"),
      password: this.config.get<string>("FILESERVER_WINRM_PASSWORD"),
      useSSL: this.config.get<string>("FILESERVER_WINRM_USE_SSL") !== "false",
    };
  }

  constructor(private readonly config: ConfigService) {}

  /**
   * Executes a PowerShell script block on the remote Windows File Server.
   * Every script this service sends MUST be idempotent-safe and MUST NOT
   * interpolate raw user input into the script text — always pass values
   * through -EncodedCommand or bound parameters to avoid injection.
   */
  async runPowerShell(script: string, params: Record<string, string> = {}): Promise<WinRmExecResult> {
    const options = this.getConnectionOptions();
    const paramBlock = Object.entries(params)
      .map(([key, value]) => `$${key} = @'\n${value}\n'@`)
      .join("\n");
    const fullScript = `${paramBlock}\n${script}`;

    this.logger.debug(`Executing remote PowerShell on ${options.host}`);

    try {
      const result = await WinRM.run(fullScript, options);
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exitCode ?? 0,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`WinRM execution failed: ${message}`);
      throw err;
    }
  }
}