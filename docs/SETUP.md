# IT Asset Management & Onboarding Platform - Setup Guide

## Overview

This is a **production-ready, containerized** platform for:
- **Inventory Management:** Hardware & software inventory collection from Windows PCs via PowerShell
- **Active Directory Integration:** LDAP sync of users, groups, organizational units
- **Software Compliance:** Master list matching, delta-update detection, compliance alerts
- **Automated Onboarding:** End-to-end employee provisioning (AD → File Server → NTFS Permissions)

---

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Client    │  POST   │   Backend    │  LDAP   │  Active      │
│  PowerShell │────────→│  (NestJS)    │────────→│  Directory   │
│  Collector  │         │              │         │              │
└─────────────┘         │              │         └──────────────┘
                        │  Express     │ WinRM
                        │  + Prisma    │────────→  File Server
                        │              │  NTFS
                        └──────┬───────┘
                               │
                        ┌──────▼────────┐
                        │  PostgreSQL    │
                        │  (Devices,     │
                        │   Compliance)  │
                        └────────────────┘
```

**Frontend:** React 18 + Vite + TailwindCSS  
**Backend:** NestJS + Express + Prisma ORM  
**Database:** PostgreSQL  
**Sync/Automation:** LDAP + WinRM + PowerShell

---

## Prerequisites

### On Your Infrastructure

1. **Active Directory Domain Controller** (LDAP/LDAPS enabled)
   - Service account for read operations (e.g., `svc-itam-sync@corp.local`)
   - Service account for write operations (AD user creation, group membership, manager attributes)

2. **Windows File Server** (SMB + WinRM)
   - WinRM enabled on port 5986 (HTTPS) or 5985 (HTTP, not recommended)
   - Service account for file operations (e.g., `svc-itam-fileops@corp.local`)
   - Shared folder for departments (e.g., `\\fileserver\CompanyData\Finance`)

3. **PostgreSQL Database**
   - Version 13+
   - Remote connectivity from Docker network

4. **Docker & Docker Compose**
   - Docker 20.10+
   - Docker Compose 2.0+

### Client Setup

- Windows 10/11 or Windows Server 2016+
- PowerShell 5.1+
- GPO or manual execution of `Collect-Inventory.ps1`

---

## Quick Start (Docker)

### 1. Clone & Configure

```bash
cd it-asset-platform
cp .env.example .env
# Edit .env with your environment values
```

### 2. Update .env

```bash
# Database
POSTGRES_USER=itam_admin
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=itam_platform

# Active Directory
AD_URL=ldaps://dc01.corp.local:636
AD_BASE_DN=DC=corp,DC=local
AD_BIND_DN=CN=svc-itam-sync,OU=ServiceAccounts,DC=corp,DC=local
AD_BIND_PASSWORD=service_account_password_here
AD_REJECT_UNAUTHORIZED=true
AD_DOMAIN=corp
AD_DOMAIN_SUFFIX=corp.local
AD_EXCLUDED_OU_PATTERNS=OU=ServiceAccounts,OU=Servers,OU=Admin*
AD_EXCLUDED_ACCOUNT_PATTERNS=svc-*,adm-*

# File Server & WinRM
FILESERVER_HOST=fileserver01.corp.local
FILESERVER_WINRM_PORT=5986
FILESERVER_WINRM_USE_SSL=true
FILESERVER_WINRM_USERNAME=CORP\\svc-itam-fileops
FILESERVER_WINRM_PASSWORD=fileop_service_account_password
FILESERVER_ROOT_SHARE=\\\\fileserver01\\CompanyData

# Backend
PORT=3000
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production

# Frontend
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

### 3. Build & Start

```bash
docker-compose up -d
```

Containers will start in order: `postgres` → `backend` → `frontend`

### 4. Verify

- **Backend API:** http://localhost:3000/api/docs
- **Frontend UI:** http://localhost:5173
- **pgAdmin (optional):** http://localhost:5050  
  ```bash
  docker-compose --profile tools up -d pgadmin
  ```

---

## AD Configuration

### Step 1: Create Service Accounts

On your DC, create two accounts:

#### Read-Only Sync Account
```powershell
# PowerShell on Domain Controller
New-ADUser -Name "svc-itam-sync" `
  -SamAccountName "svc-itam-sync" `
  -Path "OU=ServiceAccounts,DC=corp,DC=local" `
  -Enabled $true `
  -PasswordNeverExpires $true
```

Grant **Read** permissions on the domain root (via ADSI Edit or delegated permissions).

#### Write-Enabled Account (User Creation)
```powershell
New-ADUser -Name "svc-itam-admin" `
  -SamAccountName "svc-itam-admin" `
  -Path "OU=ServiceAccounts,DC=corp,DC=local" `
  -Enabled $true `
  -PasswordNeverExpires $true

# Delegate "Create, delete, and manage user accounts" on target OU(s)
# Use: Active Directory Users & Computers → Delegate Control Wizard
```

### Step 2: Verify LDAPS

```powershell
# On any domain-joined machine
openssl s_client -connect dc01.corp.local:636
# Should show valid cert
```

### Step 3: Trigger Sync

**Via API:**
```bash
curl -X POST http://localhost:3000/api/v1/active-directory/sync
```

**Response:**
```json
{
  "status": "ok",
  "syncedAt": "2026-09-09T12:00:00Z"
}
```

---

## File Server Configuration

### Step 1: Enable WinRM

**On the File Server (PowerShell as Admin):**

```powershell
# Enable WinRM
Enable-PSRemoting -SkipNetworkProfileCheck -Force

# Configure HTTPS listener (self-signed cert is OK)
$Thumbprint = (Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object { $_.Subject -match $env:COMPUTERNAME } | Sort-Object NotBefore -Descending | Select-Object -First 1).Thumbprint
New-Item -Path WSMan:\LocalHost\Listener -Transport HTTPS -Address * -CertificateThumbPrint $Thumbprint -Force

# Open firewall
netsh advfirewall firewall add rule name="WinRM HTTPS" dir=in action=allow protocol=tcp localport=5986
```

### Step 2: Grant Permissions

The service account (`svc-itam-fileops`) needs:
- **NTFS permissions** on the share root to create folders
- **WinRM remote access** (add to local Remote Management Users group)

```powershell
# On file server
Add-LocalGroupMember -Group "Remote Management Users" -Member "CORP\svc-itam-fileops"
icacls "\\fileserver01\CompanyData" /grant "CORP\svc-itam-fileops:(OI)(CI)F"
```

### Step 3: Discover Departments

**Via API:**
```bash
curl -X POST http://localhost:3000/api/v1/file-server/discover-departments
```

This scans `\\fileserver01\CompanyData` and creates entries for each subfolder.

---

## Client Inventory Collection

### Option A: Manual Execution

**On a Windows Client:**

```powershell
# Download the collector script
Invoke-WebRequest -Uri "http://YOUR_BACKEND:3000/scripts/Collect-Inventory.ps1" `
  -OutFile "$env:TEMP\Collect-Inventory.ps1"

# Run (as Administrator)
& "$env:TEMP\Collect-Inventory.ps1" `
  -ApiEndpoint "http://YOUR_BACKEND:3000/api/v1/inventory" `
  -SkipCertValidation $false
```

### Option B: GPO Deployment

1. Copy `scripts/Collect-Inventory.ps1` to a domain share (e.g., `\\fileserver\SYSVOL$\Policies`)
2. Create a GPO with a **Startup/Logon Script** pointing to the share:
   ```
   PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "\\fileserver\SYSVOL$\Policies\Collect-Inventory.ps1" `
     -ApiEndpoint "http://BACKEND_SERVER:3000/api/v1/inventory"
   ```
3. Link the GPO to an OU containing the target machines

**Verify in backend:**
```bash
curl http://localhost:3000/api/v1/inventory | jq '.[] | {computerName, lastSeenAt}'
```

---

## Software Compliance Master List

### Add Master Software Entry

```bash
curl -X POST http://localhost:3000/api/v1/software-compliance/master-list \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Google Chrome",
    "minRequiredVersion": "127.0.0",
    "isMandatory": true
  }'
```

### View Compliance Status

**Dashboard → Compliance Alerts** will show:
- ✓ **Up to Date:** Device software ≥ minimum required version
- ⚠ **Outdated:** Device software < minimum required version
- ✗ **Missing:** Mandatory software not found on device
- 🔔 **Delta Update Alert:** Device X upgraded Chrome to v128 while N devices are still on v126

---

## Onboarding Workflow

### UI Walkthrough

1. **Navigate to Onboarding tab**
2. **Step 1: Employee Info**
   - First/Last Name, Username, Email, Password
3. **Step 2: AD Config**
   - Select target OU (dropdown)
   - Select manager (dropdown)
   - Check groups to assign
4. **Step 3: Folder Config**
   - Select department (dropdown)
5. **Step 4: Review**
   - Confirm all settings
6. **Step 5: Result**
   - Success: Request ID displayed, you can check logs
   - Failure: Error message shown (check backend logs)

### Workflow Steps (Transactional)

1. ✅ Create AD user in selected OU (disabled until password set)
2. ✅ Set password via LDAPS (unicodePwd, UTF-16LE)
3. ✅ Enable account (set userAccountControl = 512)
4. ✅ Add to selected groups (memberOf attribute)
5. ✅ Set manager attribute
6. ✅ Create personal folder on file server (`\\fileserver\Department\username`)
7. ✅ Break NTFS inheritance on folder
8. ✅ Grant user FullControl, manager Modify, remove Everyone/Users

**On any failure:** workflow stops, request marked as FAILED, admin can review logs and retry.

---

## Monitoring & Troubleshooting

### Backend Logs

```bash
docker logs itam_backend -f
```

### Database Inspection

```bash
docker exec -it itam_postgres psql -U itam_admin -d itam_platform

# Check devices
SELECT computerName, lastSeenAt FROM "Device" ORDER BY lastSeenAt DESC;

# Check compliance alerts
SELECT d.computerName, ca.softwareName, ca.message FROM "ComplianceAlert" ca
JOIN "Device" d ON ca.deviceId = d.id
WHERE ca.resolved = false;
```

### Common Issues

#### ❌ "LDAP bind failed"
- Check `AD_BIND_DN` and `AD_BIND_PASSWORD` in .env
- Verify service account exists and password is correct
- Confirm LDAPS port 636 is open

#### ❌ "WinRM execution failed"
- Verify WinRM is enabled on file server: `winrm get winrm/config`
- Check firewall allows 5986 (HTTPS)
- Verify service account has Remote Management Users membership
- Test manually: `Invoke-Command -ComputerName fileserver01 -ScriptBlock { "test" }`

#### ❌ "Onboarding stuck at Step 2"
- Check backend logs for LDAP errors
- Verify target OU DN is correct format (e.g., `OU=Users,DC=corp,DC=local`)
- Ensure service account has permission to create users in that OU

#### ❌ "Inventory POST fails with 400"
- Validate PowerShell script output is valid JSON
- Check that all required fields match schema (see `InventoryPayloadDto`)
- Test with curl:
  ```bash
  curl -X POST http://localhost:3000/api/v1/inventory \
    -H "Content-Type: application/json" \
    -d @sample-payload.json
  ```

---

## Production Deployment

### Environment Checklist

- [ ] AD sync account created + permissions delegated
- [ ] File server WinRM enabled (HTTPS with valid cert)
- [ ] File server service account created + permissions granted
- [ ] PostgreSQL accessible from Docker network
- [ ] Docker Compose secrets managed (not in .env on disk)
- [ ] API firewall allows backend:3000 from frontend + clients
- [ ] LDAPS certificate valid (not self-signed in production)
- [ ] WinRM certificate valid (not self-signed in production)
- [ ] Backup strategy for PostgreSQL data volume

### Scaling Considerations

- **Backend:** Stateless, easily replicated behind load balancer
- **Frontend:** Static assets, use CDN or reverse proxy
- **Database:** Set `max_connections` in PostgreSQL config (default 100)
- **WinRM:** Single file server can handle concurrent operations; add connection pooling if needed

### Backup

```bash
# PostgreSQL backup
docker exec itam_postgres pg_dump -U itam_admin itam_platform > backup.sql

# Restore
docker exec -i itam_postgres psql -U itam_admin itam_platform < backup.sql

# Volume snapshot
docker volume inspect itam_postgres_data  # note the Mountpoint
# tar/backup the directory
```

---

## API Endpoints Summary

### Inventory
- `POST /api/v1/inventory` — Ingest device report (PowerShell collector)
- `GET /api/v1/inventory` — List devices
- `GET /api/v1/inventory/:id` — Device detail + hardware + software

### Active Directory
- `POST /api/v1/active-directory/sync` — Manual sync trigger
- `GET /api/v1/active-directory/users` — List users (dropdown)
- `GET /api/v1/active-directory/groups` — List groups
- `GET /api/v1/active-directory/ous` — List OUs
- `GET /api/v1/active-directory/hierarchy?userDn=...` — Get manager chain

### File Server
- `POST /api/v1/file-server/discover-departments` — Discover folders
- `GET /api/v1/file-server/departments` — List departments

### Software Compliance
- `GET /api/v1/software-compliance/master-list` — View master list
- `POST /api/v1/software-compliance/master-list` — Add/update master software
- `GET /api/v1/software-compliance/alerts` — View open alerts

### Onboarding
- `POST /api/v1/onboarding` — Start onboarding (wizard submission)
- `GET /api/v1/onboarding` — List onboarding requests
- `GET /api/v1/onboarding/:id` — Onboarding request detail + logs

---

## Support & Further Customization

### Extending the Platform

1. **Custom Software Compliance Rules:** Modify `software-compliance.service.ts`
2. **Additional Device Metrics:** Extend PowerShell collector script
3. **Email Notifications:** Add nodemailer in onboarding service
4. **Audit Logging:** Log all API calls + AD writes to Audit table
5. **RBAC:** Add role-based access control using JWT claims

### Database Migrations

```bash
# Generate migration from schema changes
docker exec -it itam_backend npx prisma migrate dev --name your_migration_name

# Apply pending migrations
docker exec -it itam_backend npx prisma migrate deploy
```

---

## License & Support

This platform is provided as-is for IT asset and HR automation. Customize and deploy within your organization's governance policies.

For questions or issues, refer to the codebase comments and inline documentation.
