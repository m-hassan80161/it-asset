[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl
)

$ErrorActionPreference = "Stop"
$registryPath = "HKLM:\SOFTWARE\ITAM\WindowsAgent"
$serviceName = "ITAM Windows Agent"

try {
    $currentPrincipal = [Security.Principal.WindowsPrincipal]::new(
        [Security.Principal.WindowsIdentity]::GetCurrent()
    )
    if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an elevated PowerShell window."
    }
    $targetUri = $null
    if (-not [Uri]::TryCreate($ServerUrl, [UriKind]::Absolute, [ref]$targetUri) -or
        $targetUri.Scheme -ne "https" -or
        $targetUri.AbsolutePath -ne "/" -or
        $targetUri.Query -or
        $targetUri.Fragment -or
        $targetUri.UserInfo) {
        throw "ServerUrl must be an HTTPS origin without an API path."
    }
    $ServerUrl = $targetUri.GetLeftPart([UriPartial]::Authority)

    $settings = Get-ItemProperty -LiteralPath $registryPath
    $installId = [string]$settings.InstallId
    $currentServerUrl = [string]$settings.ServerUrl
    $parsedInstallId = [guid]::Empty
    if (-not [guid]::TryParse($installId, [ref]$parsedInstallId)) {
        throw "The installed Agent ID is missing or invalid."
    }
    if ($currentServerUrl -notmatch "^https://[^/]+(?::\d+)?/?$") {
        throw "The current server URL is missing or invalid."
    }

    $secureCredential = $null
    $credentialPointer = [IntPtr]::Zero
    try {
        $secureCredential = Read-Host "Enter the one-time server-change credential from the Agent console" -AsSecureString
        $credentialPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCredential)
        $credential = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($credentialPointer)

        $authorizationUrl = $currentServerUrl.TrimEnd([char[]]@("/")) + "/api/v1/windows-agent/configuration/authorize"
        $body = @{
            installId = $installId
            credential = $credential
        } | ConvertTo-Json -Compress
        $authorization = Invoke-RestMethod -Method Post -Uri $authorizationUrl `
            -ContentType "application/json" -Body $body
    }
    finally {
        if ($credentialPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($credentialPointer)
        }
        if ($secureCredential) {
            $secureCredential.Dispose()
        }
        $credential = $null
        $body = $null
    }

    if (-not $authorization.authorized) {
        throw "The server did not authorize this Agent configuration change."
    }

    Set-ItemProperty -LiteralPath $registryPath -Name "ServerUrl" -Value $ServerUrl
    Restart-Service -Name $serviceName -Force

    Write-Host "Agent server changed. The Agent will reconnect and enroll if the new server does not recognize its existing credential." -ForegroundColor Green
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
