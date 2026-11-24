param(
    [Parameter(Mandatory = $true)]
    [string]$AgentUpdatePublicKeyFile,
    [Parameter(Mandatory = $true)]
    [string]$ServerCertificateFile,
    [string]$Version = "1.0.1",
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl
)

$ErrorActionPreference = "Stop"
$exitCode = 1

try {
    $AgentProject = Join-Path $PSScriptRoot "ITAM.WindowsAgent/ITAM.WindowsAgent.csproj"
    $TrayProject = Join-Path $PSScriptRoot "ITAM.WindowsAgent.Tray/ITAM.WindowsAgent.Tray.csproj"
    $InstallerProject = Join-Path $PSScriptRoot "ITAM.WindowsAgent.Installer/ITAM.WindowsAgent.Installer.wixproj"
    $PublishDirectory = Join-Path $PSScriptRoot "ITAM.WindowsAgent.Installer/publish"
    $OutputDirectory = Join-Path $PSScriptRoot "dist"

    Write-Host ""
    Write-Host "ITAM Windows Agent build" -ForegroundColor Cyan
    Write-Host "Project folder: $PSScriptRoot"

    if (-not (Test-Path -LiteralPath $AgentProject -PathType Leaf)) {
        throw "Agent project was not found: $AgentProject"
    }
    if (-not (Test-Path -LiteralPath $InstallerProject -PathType Leaf)) {
        throw "WiX installer project was not found: $InstallerProject"
    }
    if (-not (Test-Path -LiteralPath $TrayProject -PathType Leaf)) {
        throw "Agent tray project was not found: $TrayProject"
    }
    if (-not (Test-Path -LiteralPath $AgentUpdatePublicKeyFile -PathType Leaf)) {
        throw "Public key file was not found: $AgentUpdatePublicKeyFile"
    }
    if (-not (Test-Path -LiteralPath $ServerCertificateFile -PathType Leaf)) {
        throw "Server certificate file was not found: $ServerCertificateFile"
    }
    if ($Version -notmatch "^\d+\.\d+\.\d+$") {
        throw "Version must use x.y.z format for MSI upgrades."
    }
    if ($ServerUrl -notmatch "^https://[^/]+(?::\d+)?/?$") {
        throw "ServerUrl must be an HTTPS origin without an API path."
    }

    $dotnetCommand = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $dotnetCommand) {
        throw ".NET SDK was not found in PATH. Install .NET 10 SDK and reopen PowerShell."
    }

    Write-Host "Checking .NET SDK..."
    & dotnet --version
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet --version failed."
    }

    $publicKeyPath = (Resolve-Path -LiteralPath $AgentUpdatePublicKeyFile).Path
    $serverCertificatePath = (Resolve-Path -LiteralPath $ServerCertificateFile).Path
    $certificateText = [System.IO.File]::ReadAllText($serverCertificatePath)
    if ($certificateText -match "-----BEGIN [^-]*PRIVATE KEY-----" -or
        $certificateText -notmatch "-----BEGIN CERTIFICATE-----") {
        throw "ServerCertificateFile must contain a public PEM certificate only; never bundle server.key."
    }
    $certificateMatches = [regex]::Matches(
        $certificateText,
        "-----BEGIN CERTIFICATE-----(?<data>.*?)-----END CERTIFICATE-----",
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    if ($certificateMatches.Count -ne 1) {
        throw "ServerCertificateFile must contain exactly one PEM certificate."
    }
    $certificateBase64 = $certificateMatches[0].Groups["data"].Value -replace "\s", ""
    try {
        $certificateBytes = [Convert]::FromBase64String($certificateBase64)
        $serverCertificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificateBytes)
    }
    catch {
        throw "ServerCertificateFile is not a valid PEM X.509 certificate: $($_.Exception.Message)"
    }
    if ($serverCertificate.HasPrivateKey) {
        throw "ServerCertificateFile unexpectedly contains private key material."
    }
    if ((Get-Date) -lt $serverCertificate.NotBefore -or (Get-Date) -gt $serverCertificate.NotAfter) {
        throw "ServerCertificateFile is not currently valid."
    }
    Write-Host "Public key: $publicKeyPath"
    Write-Host "TLS certificate: $serverCertificatePath"
    Write-Host "Version: $Version"
    Write-Host "Default server: $ServerUrl"

    $generatedDirectories = @(
        (Join-Path $PSScriptRoot "ITAM.WindowsAgent/bin"),
        (Join-Path $PSScriptRoot "ITAM.WindowsAgent/obj"),
        (Join-Path $PSScriptRoot "ITAM.WindowsAgent.Tray/bin"),
        (Join-Path $PSScriptRoot "ITAM.WindowsAgent.Tray/obj"),
        (Join-Path $PSScriptRoot "ITAM.WindowsAgent.Installer/bin"),
        (Join-Path $PSScriptRoot "ITAM.WindowsAgent.Installer/obj")
    )
    foreach ($directory in $generatedDirectories) {
        if (Test-Path -LiteralPath $directory -PathType Container) {
            Write-Host "Removing machine-specific build cache: $directory"
            Remove-Item -LiteralPath $directory -Recurse -Force
        }
    }

    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

    Write-Host "Publishing Windows x64 agent..." -ForegroundColor Yellow
    & dotnet publish $AgentProject -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=false `
        -p:AgentVersion=$Version `
        "-p:AgentUpdatePublicKeyFile=$publicKeyPath"
    if ($LASTEXITCODE -ne 0) {
        throw "Windows agent publish failed. Read the error above."
    }

    $AgentOutput = Join-Path $PSScriptRoot "ITAM.WindowsAgent/bin/Release/net10.0-windows/win-x64/publish"
    if (-not (Test-Path -LiteralPath $AgentOutput -PathType Container)) {
        throw "Published output was not found: $AgentOutput"
    }

    if (Test-Path -LiteralPath $PublishDirectory) {
        Remove-Item -LiteralPath $PublishDirectory -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $PublishDirectory | Out-Null
    Copy-Item -Path (Join-Path $AgentOutput "*") -Destination $PublishDirectory -Recurse -Force
    $installerCertificatePath = Join-Path $PublishDirectory "server.cer"
    [System.IO.File]::WriteAllBytes($installerCertificatePath, $certificateBytes)

    $TrayPublishDirectory = Join-Path $PublishDirectory "Tray"
    New-Item -ItemType Directory -Force -Path $TrayPublishDirectory | Out-Null
    Write-Host "Publishing Windows tray application..." -ForegroundColor Yellow
    & dotnet publish $TrayProject -c Release -r win-x64 --self-contained true `
        "-p:PublishDir=$TrayPublishDirectory/"
    if ($LASTEXITCODE -ne 0) {
        throw "Windows tray application publish failed. Read the error above."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $TrayPublishDirectory "ITAM.WindowsAgent.Tray.exe") -PathType Leaf)) {
        throw "The published tray application was not found: $TrayPublishDirectory"
    }

    Write-Host "Building the MSI installer..." -ForegroundColor Yellow
    & dotnet build $InstallerProject -c Release `
        -p:AgentVersion=$Version `
        "-p:ServerUrl=$ServerUrl" `
        "-p:OutputPath=$OutputDirectory/"
    if ($LASTEXITCODE -ne 0) {
        throw "Windows MSI build failed. WiX MSI builds must run on Windows."
    }

    $MsiPath = Join-Path $OutputDirectory "ITAM.WindowsAgent.msi"
    if (-not (Test-Path -LiteralPath $MsiPath -PathType Leaf)) {
        throw "MSI was not created in: $OutputDirectory"
    }

    Write-Host ""
    Write-Host "Build completed successfully." -ForegroundColor Green
    Write-Host "MSI: $MsiPath"
    Write-Host "Size: $((Get-Item -LiteralPath $MsiPath).Length) bytes"
    Write-Host "Default server: $ServerUrl (can be overridden during installation)."
    Write-Host "The MSI installs the bundled public certificate into the Local Computer Trusted Root store."
    Write-Host ""
    Write-Host 'Install with the SERVER_URL MSI property; enrollment is automatic.'
    $exitCode = 0
}
catch {
    Write-Host ""
    Write-Host "BUILD FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace
    }
}
finally {
    Write-Host ""
    Write-Host "Output folder: $OutputDirectory"
    Write-Host "Press Enter to close this window..."
    Read-Host | Out-Null
}

exit $exitCode
