#!/usr/bin/env powershell
<#
.SYNOPSIS
IT Asset Inventory Collector
Collects hardware, software, and Git configuration from local machine.
Runs via GPO (Logon/Startup) on domain-joined Windows machines.

.PARAMETER ApiEndpoint
Destination backend API endpoint (default: http://localhost:3000/api/v1/inventory)

.PARAMETER UseHttps
Use HTTPS for connection (default: $true)

.PARAMETER SkipCertValidation
Ignore SSL certificate validation errors (default: $false)
#>

param(
    [string]$ApiEndpoint = "http://localhost:3000/api/v1/inventory",
    [bool]$UseHttps = $false,
    [bool]$SkipCertValidation = $false
)

#Requires -Version 5.1
#Requires -RunAsAdministrator

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Verbose "[$timestamp] [$Level] $Message"
}

Write-Log "Starting inventory collection..."

# ====================================================================
# 1. COMPUTER METADATA
# ====================================================================
$computerInfo = Get-ComputerInfo -Property CsComputerName, CsLogonUserName, OsName, OsVersion, WindowsProductId, CsPartOfDomain, CsDomain

$metadata = @{
    computerName = $computerInfo.CsComputerName ?? $env:COMPUTERNAME
    loggedInUser = $computerInfo.CsLogonUserName ?? $null
    osName       = $computerInfo.OsName ?? "Unknown"
    osVersion    = $computerInfo.OsVersion ?? "Unknown"
    osBuild      = $computerInfo.WindowsProductId ?? "Unknown"
    domain       = if ($computerInfo.CsPartOfDomain) { $computerInfo.CsDomain ?? $env:USERDOMAIN } else { $null }
}

Write-Log "Computer: $($metadata.computerName) | User: $($metadata.loggedInUser) | OS: $($metadata.osName)"

# ====================================================================
# 2. CPU INFORMATION
# ====================================================================
$cpu = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
$cpuInfo = @{
    model        = $cpu.Name ?? "Unknown"
    cores        = $cpu.NumberOfCores ?? 1
    threads      = $cpu.NumberOfLogicalProcessors ?? 1
    clockSpeedMhz = $cpu.MaxClockSpeed ?? 0
    architecture = $cpu.Architecture ?? "x86"
}
Write-Log "CPU: $($cpuInfo.model) ($($cpuInfo.cores) cores, $($cpuInfo.threads) threads)"

# ====================================================================
# 3. MOTHERBOARD INFORMATION
# ====================================================================
$board = Get-CimInstance -ClassName Win32_BaseBoard | Select-Object -First 1
$motherboardInfo = @{
    manufacturer = $board.Manufacturer ?? "Unknown"
    model        = $board.Product ?? "Unknown"
    serialNumber = $board.SerialNumber ?? "N/A"
}
Write-Log "Motherboard: $($motherboardInfo.manufacturer) $($motherboardInfo.model)"

# ====================================================================
# 4. RAM MODULES (with serial numbers)
# ====================================================================
$ramModules = @()
$ramSticks = Get-CimInstance -ClassName Win32_PhysicalMemory
foreach ($stick in $ramSticks) {
    $ramModules += @{
        capacityGb = [math]::Round($stick.Capacity / 1GB, 2)
        speedMhz   = $stick.Speed ?? 0
        serialNumber = $stick.SerialNumber ?? $null
        slot       = $stick.BankLabel ?? $null
    }
}
Write-Log "RAM: $($ramModules.Count) module(s) detected"

# ====================================================================
# 5. DISK DRIVES (SSD/HDD/NVMe with free space)
# ====================================================================
$diskDrives = @()
$disks = Get-CimInstance -ClassName Win32_DiskDrive
foreach ($disk in $disks) {
    # Determine type (simplified: check name patterns or media type)
    $diskType = "UNKNOWN"
    if ($disk.Model -match "NVMe|NVME") {
        $diskType = "NVME"
    } elseif ($disk.Model -match "SSD") {
        $diskType = "SSD"
    } else {
        # Fallback: assume HDD unless it's obviously NVMe/SSD
        $diskType = if ($disk.InterfaceType -eq "SCSI") { "HDD" } else { "HDD" }
    }

    $diskDrives += @{
        type          = $diskType
        serialNumber  = $disk.SerialNumber ?? $null
        totalSpaceGb  = [math]::Round($disk.Size / 1GB, 2)
        freeSpaceGb   = 0  # Will be populated from logical volumes
    }
}

# Enhance free space from logical volumes
$volumes = Get-CimInstance -ClassName Win32_LogicalDiskToPartition | ForEach-Object {
    $logical = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DeviceID -eq $_.Name }
    if ($logical) {
        [pscustomobject]@{
            DiskIndex   = $_.Antecedent.Index
            FreeSpaceGb = [math]::Round($logical.FreeSpace / 1GB, 2)
        }
    }
}
Write-Log "Disks: $($diskDrives.Count) drive(s) detected"

# ====================================================================
# 6. INSTALLED SOFTWARE (from registry uninstall keys)
# ====================================================================
$softwareList = @()
$uninstallPaths = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)

$installedApps = @()
foreach ($path in $uninstallPaths) {
    if (Test-Path $path) {
        $installedApps += Get-ItemProperty $path | Where-Object { $_.DisplayName }
    }
}

# Remove duplicates by DisplayName
$installedApps = $installedApps | Sort-Object DisplayName -Unique

foreach ($app in $installedApps) {
    if ($app.DisplayName) {
        $softwareList += @{
            name        = $app.DisplayName
            version     = $app.DisplayVersion ?? "Unknown"
            publisher   = $app.Publisher ?? $null
            installDate = $app.InstallDate ?? $null
        }
    }
}
Write-Log "Software: $($softwareList.Count) application(s) found"

# ====================================================================
# 7. GIT CONFIGURATION
# ====================================================================
$gitConfig = $null
try {
    $gitExe = Get-Command git -ErrorAction SilentlyContinue
    if ($gitExe) {
        $gitVersion = & git --version 2>$null
        $gitUserName = & git config --global user.name 2>$null
        $gitUserEmail = & git config --global user.email 2>$null

        # Try to extract SSH key fingerprints (basic attempt)
        $sshKeys = @()
        $sshDir = "$env:USERPROFILE\.ssh"
        if (Test-Path $sshDir) {
            $pubKeys = Get-ChildItem "$sshDir\*.pub" -ErrorAction SilentlyContinue
            foreach ($key in $pubKeys) {
                $sshKeys += $key.BaseName  # Just store the key name for now
            }
        }

        $gitConfig = @{
            userName     = $gitUserName ?? $null
            userEmail    = $gitUserEmail ?? $null
            gitVersion   = $gitVersion ?? $null
            sshPublicKeys = $sshKeys
        }
        Write-Log "Git: found (version: $gitVersion)"
    }
} catch {
    Write-Log "Git: not found or error querying git config" "WARN"
}

# ====================================================================
# 8. BUILD FINAL PAYLOAD & POST
# ====================================================================
$payload = @{
    computerName = $metadata.computerName
    loggedInUser = $metadata.loggedInUser
    osName       = $metadata.osName
    osVersion    = $metadata.osVersion
    osBuild      = $metadata.osBuild
    domain       = $metadata.domain
    cpu          = $cpuInfo
    motherboard  = $motherboardInfo
    ramModules   = $ramModules
    disks        = $diskDrives
    software     = $softwareList
    gitConfig    = $gitConfig
} | ConvertTo-Json -Depth 10

Write-Log "Payload size: $($payload.Length) bytes"
Write-Log "Posting to $ApiEndpoint..."

try {
    $params = @{
        Uri    = $ApiEndpoint
        Method = "POST"
        ContentType = "application/json"
        Body   = $payload
    }

    if ($SkipCertValidation) {
        $params["SkipCertificateCheck"] = $true
    }

    $response = Invoke-RestMethod @params
    Write-Log "Upload successful: $($response.status)" "SUCCESS"
} catch {
    Write-Log "Upload failed: $($_.Exception.Message)" "ERROR"
    exit 1
}

Write-Log "Inventory collection completed." "SUCCESS"
