param(
    [string]$MsiPath = (Join-Path $PSScriptRoot "ITAM.WindowsAgent.msi"),
    [string]$ServerUrl = ""
)

$ErrorActionPreference = "Stop"

$LogDirectory = Join-Path $env:ProgramData "ITAM\WindowsAgent\deployment"
$LogPath = Join-Path $LogDirectory "gpo-install.log"
$InstallDirectory = Join-Path $env:ProgramFiles "ITAM\WindowsAgent"
$ServiceName = "ITAM Windows Agent"

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

function Write-DeploymentLog {
    param([string]$Message)
    Add-Content -LiteralPath $LogPath -Value "[$(Get-Date -Format s)] $Message"
}

try {
    if ($ServerUrl -and $ServerUrl -notmatch "^https://[^/]+(?::\d+)?/?$") {
        throw "ServerUrl must be an HTTPS origin without an API path."
    }
    if (-not (Test-Path -LiteralPath $MsiPath -PathType Leaf)) {
        throw "The MSI is unavailable at the deployment share."
    }

    $installedExecutable = Join-Path $InstallDirectory "ITAM.WindowsAgent.exe"
    if ((Test-Path -LiteralPath $installedExecutable) -and (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
        Write-DeploymentLog "Agent is already installed; no action taken."
        exit 0
    }

    Write-DeploymentLog "Starting silent MSI installation."
    $arguments = @("/i", "`"$MsiPath`"", "/qn", "/norestart")
    if ($ServerUrl) {
        $arguments = @("/i", "`"$MsiPath`"", "SERVER_URL=`"$ServerUrl`"", "/qn", "/norestart")
    }
    $process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" `
        -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden

    if ($process.ExitCode -notin @(0, 3010)) {
        throw "MSI installation failed with exit code $($process.ExitCode)."
    }

    Write-DeploymentLog "MSI installation completed with exit code $($process.ExitCode)."
    exit 0
}
catch {
    Write-DeploymentLog "Deployment failed: $($_.Exception.Message)"
    exit 1
}
