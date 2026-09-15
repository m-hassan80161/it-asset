import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { WinRmService } from "../../common/winrm/winrm.service";

@Injectable()
export class FileServerService {
  private readonly logger = new Logger(FileServerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly winrm: WinRmService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Step 3 of onboarding: creates a personal folder for the user inside
   * their assigned department folder.
   * Returns the UNC path on success.
   */
  async createUserFolder(departmentUncPath: string, username: string): Promise<string> {
    const userFolderPath = `${departmentUncPath}\\${username}`;

    // PowerShell script: create folder if not exists, return its full path
    const script = `
      $path = @'
${userFolderPath}
'@
      if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
      }
      Write-Output "FOLDER_CREATED:$path"
    `;

    const result = await this.winrm.runPowerShell(script);
    if (result.exitCode !== 0) {
      this.logger.error(`Folder creation failed: ${result.stderr}`);
      throw new Error(`Failed to create folder: ${result.stderr}`);
    }

    this.logger.log(`Created folder: ${userFolderPath}`);
    return userFolderPath;
  }

  /**
   * Step 4 of onboarding: sets explicit NTFS permissions so ONLY the user
   * and their manager can access the folder. Breaks inheritance to prevent
   * unintended permission propagation.
   */
  async setNtfsPermissions(folderPath: string, username: string, managerUsername?: string): Promise<void> {
    // Escape backslashes for PowerShell strings
    const escapedPath = folderPath.replace(/\\/g, "\\\\");
    const domain = this.config.get<string>("AD_DOMAIN") ?? "CORP";

    const script = `
      $path = @'
${escapedPath}
'@
      $user = '${domain}\\${username}'
      $manager = '${domain}\\${managerUsername ?? ""}'

      # Get the ACL
      $acl = Get-Acl $path

      # Break inheritance to prevent inherited permissions from parent folders
      $acl.SetAccessRuleProtection($true, $false)

      # Remove the default 'Users' and 'Everyone' rules if they exist
      $acl.Access | Where-Object {
        $_.IdentityReference -like "*Users" -or $_.IdentityReference -like "*Everyone"
      } | ForEach-Object {
        $acl.RemoveAccessRule($_) | Out-Null
      }

      # Grant the user explicit FullControl
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $user,
        "FullControl",
        "ContainerInherit, ObjectInherit",
        "None",
        "Allow"
      )
      $acl.AddAccessRule($rule)

      # Grant the manager (if specified) explicit Modify access
      if ($manager -and $manager -ne 'CORP\\') {
        $managerRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
          $manager,
          "Modify",
          "ContainerInherit, ObjectInherit",
          "None",
          "Allow"
        )
        $acl.AddAccessRule($managerRule)
      }

      # Apply the updated ACL
      Set-Acl -Path $path -AclObject $acl
      Write-Output "PERMISSIONS_SET:$path"
    `;

    const result = await this.winrm.runPowerShell(script);
    if (result.exitCode !== 0) {
      this.logger.error(`Permission setting failed: ${result.stderr}`);
      throw new Error(`Failed to set permissions: ${result.stderr}`);
    }

    this.logger.log(`Set NTFS permissions for ${folderPath}`);
  }

  /**
   * Scans the file server to discover department folder structure.
   * Stores results in the DepartmentFolder table for dropdown/selection
   * during onboarding.
   */
  async discoverDepartmentFolders(): Promise<void> {
    const rootShare = this.config.get<string>("FILESERVER_ROOT_SHARE");
    const escapedRoot = rootShare?.replace(/\\/g, "\\\\");

    const script = `
      $root = @'
${escapedRoot}
'@
      if (-not (Test-Path $root)) {
        Write-Output "ERROR:Root share not accessible"
        exit 1
      }
      Get-ChildItem -Path $root -Directory | ForEach-Object {
        Write-Output "FOLDER:$($_.FullName)|$($_.Name)"
      }
    `;

    const result = await this.winrm.runPowerShell(script);
    if (result.exitCode !== 0) {
      this.logger.error(`Folder discovery failed: ${result.stderr}`);
      return;
    }

    const lines = result.stdout.split("\n").filter((l) => l.startsWith("FOLDER:"));
    for (const line of lines) {
      const [, path, name] = line.match(/FOLDER:(.+)\|(.+)/) ?? [];
      if (path && name) {
        await this.prisma.departmentFolder.upsert({
          where: { uncPath: path },
          create: { name, uncPath: path },
          update: { name },
        });
      }
    }

    this.logger.log(`Discovered ${lines.length} department folder(s)`);
  }

  async listDepartmentFolders() {
    return this.prisma.departmentFolder.findMany({ orderBy: { name: "asc" } });
  }
}
