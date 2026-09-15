# Architecture & Implementation Summary

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    IT ASSET MANAGEMENT PLATFORM                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────────────────┐  │
│  │     FRONTEND     │         │      BACKEND (NestJS)        │  │
│  ├──────────────────┤         ├──────────────────────────────┤  │
│  │ React 18         │         │                              │  │
│  │ + TypeScript     │◄────────│ API v1 Endpoints             │  │
│  │ + TailwindCSS    │ HTTP    │ (Express + Prisma ORM)       │  │
│  │                  │         │                              │  │
│  │ Pages:           │         │ Modules:                     │  │
│  │ • Dashboard      │         │ • Inventory (collection)     │  │
│  │ • Devices        │         │ • Active Directory (LDAP)    │  │
│  │ • Compliance     │         │ • File Server (WinRM)        │  │
│  │ • Onboarding     │         │ • Software Compliance        │  │
│  │   Wizard         │         │ • Onboarding (orchestration) │  │
│  └──────────────────┘         └──────┬───────────────────────┘  │
│         :5173                         :3000                      │
│                                       │                          │
│  ┌──────────────────────────────────┬┴──────────────────────┐   │
│  │                                  │                       │   │
│  │  ┌─────────────────────────────┐ │ ┌──────────────────┐  │   │
│  │  │   PostgreSQL Database       │ │ │  Common Services │  │   │
│  │  ├─────────────────────────────┤ │ ├──────────────────┤  │   │
│  │  │ • Devices                   │ │ │ • LDAP Client    │  │   │
│  │  │ • CPU/RAM/Disk/Motherboard  │ │ │ • WinRM Service  │  │   │
│  │  │ • Software Inventory        │ │ │ • Prisma Service │  │   │
│  │  │ • Compliance Status         │ │ └──────────────────┘  │   │
│  │  │ • AD Users/Groups/OUs       │ │                       │   │
│  │  │ • Onboarding Workflow       │ │                       │   │
│  │  └─────────────────────────────┘ │                       │   │
│  │         :5432                     │                       │   │
│  └─────────────────────────────────┬─┴──────────────────────┘   │
│                                     │                            │
└─────────────────────────────────────┼────────────────────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
        ┌───────▼─────────┐   ┌───────▼──────────┐  ┌──────▼──────┐
        │  Active         │   │  Windows File    │  │  Client PCs │
        │  Directory      │   │  Server (WinRM)  │  │  (PowerShell)
        │  (LDAP/LDAPS)   │   │  (SMB + NTFS)    │  │             │
        │                 │   │                  │  │ Collector   │
        └─────────────────┘   └──────────────────┘  │ Script      │
           :636                    :5986            └─────────────┘
           LDAPS                   WinRM                 POST
```

---

## Module Breakdown

### 1. **Inventory Module** (`/api/v1/inventory`)

**Purpose:** Collect hardware & software snapshots from domain-joined Windows PCs.

**Flow:**
1. PowerShell script runs on client (via GPO or manual execution)
2. Script collects:
   - Hardware: CPU cores/threads, RAM capacity, motherboard, disks (type/size/free)
   - Software: Installed apps with version, publisher, install date
   - Git config: global username, email, SSH key fingerprints
3. Posts JSON payload to backend
4. Backend upserts device record + all hardware/software children in a transaction

**Files:**
- `inventory.controller.ts` — POST /inventory (ingest), GET /inventory (list), GET /inventory/:id (detail)
- `inventory.service.ts` — Upsert logic + transactional coordination with SoftwareComplianceService
- `dto/inventory-payload.dto.ts` — Request DTO with class-validator validation

**Database:**
- Device, CpuInfo, MotherboardInfo, RamModule, DiskDrive, InstalledSoftware, GitConfig

---

### 2. **Active Directory Module** (`/api/v1/active-directory`)

**Purpose:** Sync AD objects (users, groups, OUs) and support user creation for onboarding.

**Features:**
- Read-only sync via service account
- Configurable exclusion filters (regex patterns for OUs, accounts)
- Manager hierarchy resolution (user → manager → department head)
- Write operations for onboarding (user creation, password set, group assignment)

**Flow:**
1. `POST /sync` — Manual trigger to sync all OUs → Groups → Users
2. Exclusion rules applied (e.g., skip `OU=ServiceAccounts,*` and accounts matching `svc-*`)
3. Manager DNs stored for org hierarchy queries
4. Onboarding uses write methods to:
   - Create user in target OU
   - Set password via LDAPS (unicodePwd in UTF-16LE)
   - Add to groups
   - Set manager attribute

**Files:**
- `ad.service.ts` — Sync logic + LDAP write operations
- `ad.controller.ts` — REST endpoints for sync trigger + data queries
- `ad.module.ts` — Wires LdapClientService

**Common Services:**
- `LdapClientService` (`/common/ldap/ldap-client.service.ts`)
  - Abstracts ldapts library
  - Short-lived connections (bind → query → unbind)
  - Error handling + logging

**Database:**
- AdOrganizationalUnit, AdGroup, AdUser, AdUserGroup, AdSyncExclusionRule

---

### 3. **File Server Module** (`/api/v1/file-server`)

**Purpose:** Provision personal folders + set NTFS permissions for new employees.

**Features:**
- Discover department folder structure on file server
- Create user-specific subdirectory
- Break NTFS inheritance
- Grant user FullControl, manager Modify, remove Everyone/Users

**Flow:**
1. `POST /discover-departments` — WinRM scan of share root, create DepartmentFolder records
2. `GET /departments` — Return list for onboarding dropdown
3. Onboarding calls `FileServerService.createUserFolder()` + `setNtfsPermissions()`

**Files:**
- `file-server.service.ts` — PowerShell script execution for folder creation + permission setting
- `file-server.controller.ts` — REST endpoints
- `file-server.module.ts` — Wires WinRmService

**Common Services:**
- `WinRmService` (`/common/winrm/winrm.service.ts`)
  - Wraps node-winrm library
  - Runs PowerShell scripts remotely (basic auth over HTTPS)
  - Captures stdout/stderr/exitCode

**Database:**
- DepartmentFolder

---

### 4. **Software Compliance Module** (`/api/v1/software-compliance`)

**Purpose:** Define baseline software versions, check compliance, alert on upgrades.

**Features:**
- Master list: admin-defined required software + minimum versions
- Compliance status: UP_TO_DATE, OUTDATED, MISSING, NOT_TRACKED
- Delta-update detector: alert when one device upgrades before others
- Semver comparison: handles non-strict versions (e.g., "23.4" → "23.4.0")

**Flow:**
1. Inventory service calls `SoftwareComplianceService.reconcileDeviceSoftware(deviceId, software[])`
2. For each app:
   - Compute compliance status (version ≥ minRequired?)
   - Check if this version is newer than any other device (delta-detector)
   - If newer + others lag behind → create ComplianceAlert
3. Frontend dashboard shows alerts + non-compliant devices

**Files:**
- `software-compliance.service.ts` — Master list mgmt + reconciliation + delta-detector
- `software-compliance.controller.ts` — REST endpoints
- `software-compliance.module.ts`

**Database:**
- MasterSoftware, InstalledSoftware, ComplianceAlert

---

### 5. **Onboarding Module** (`/api/v1/onboarding`)

**Purpose:** Orchestrate end-to-end employee provisioning (transactional workflow).

**Features:**
- Multi-step form wizard (employee info → AD config → file server config → review)
- Atomic workflow: all steps succeed or entire request fails
- Detailed logging of each step
- Error recovery (admin can retry failed step)

**Workflow Steps:**
1. Create AD user in target OU (disabled)
2. Set password via LDAPS (unicodePwd UTF-16LE)
3. Enable account (userAccountControl = 512)
4. Add to groups + set manager
5. Create personal folder on file server
6. Break NTFS inheritance
7. Grant permissions (user FullControl, manager Modify)

**Files:**
- `onboarding.service.ts` — Step orchestration + logging
- `onboarding.controller.ts` — REST endpoints (POST to start, GET to list/detail)
- `dto/create-employee-onboarding.dto.ts` — Request validation

**Database:**
- OnboardingRequest, OnboardingLog

**Dependencies:**
- ActiveDirectoryService (user creation, group assignment)
- FileServerService (folder creation, permissions)

---

## Database Schema (Prisma)

### Key Entities

**Device** (central)
- Unique: computerName
- Children: CpuInfo, MotherboardInfo, RamModule[], DiskDrive[], InstalledSoftware[], GitConfig
- Relationships: complianceAlerts[]

**InstalledSoftware**
- Tracks software per device
- Linkage: masterSoftwareId → MasterSoftware
- Stores: complianceStatus (enum)

**MasterSoftware**
- Admin-defined baseline
- isMandatory flag for delta-detector
- Referenced by: InstalledSoftware[]

**ComplianceAlert**
- Created by software-compliance service
- Links: deviceId → Device
- Stores: softwareName, newVersion, laggingCount, message
- Flag: resolved (for marking alerts as seen)

**AdUser, AdGroup, AdOrganizationalUnit**
- LDAP sync cache
- AdUser → manager (self-referential FK)
- AdUserGroup junction for many-to-many

**OnboardingRequest**
- Tracks workflow progress
- Status: PENDING → AD_USER_CREATED → AD_GROUPS_ASSIGNED → FOLDER_CREATED → NTFS_PERMISSIONS_SET → COMPLETED (or FAILED)
- OnboardingLog[] for audit trail

**DepartmentFolder**
- File server folders available for onboarding
- Stores: uncPath, name

---

## Frontend Architecture

### Pages

**Home** (Dashboard)
- Stats cards: device count, non-compliant, open alerts, active users
- Quick navigation tiles
- Getting started guide

**DeviceList**
- Paginated table of devices
- Columns: computerName, user, OS, lastSeenAt, alert count
- Click row → DeviceDetail

**DeviceDetail**
- Hardware specs: CPU, RAM, motherboard, disks
- Software table: name, version, compliance status, publisher
- Git config info
- Compliance alerts (if any)

**ComplianceAlerts**
- Non-resolved alerts only
- Card per alert: software name, new version, lagging device count
- Device name + timestamp

**OnboardingWizard** (4-step form)
- Step 1: Employee info (first/last name, username, email, password)
- Step 2: AD config (target OU dropdown, manager dropdown, group checkboxes)
- Step 3: File server config (department dropdown)
- Step 4: Review (confirm all settings)
- Result: success (request ID) or failure (error message)

### Components

**App** — Main router + nav bar

**API Client** (`lib/api.ts`)
- Axios instance with baseURL from VITE_API_BASE_URL
- Namespaced API calls: inventoryApi, adApi, fileServerApi, complianceApi, onboardingApi

### Styling

- TailwindCSS utility classes
- Lucide icons (ChevronRight, AlertTriangle, etc.)
- No external UI library (shadcn/ui prepared but basic Tailwind sufficient for MVP)

---

## Deployment Architecture (Docker Compose)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    Healthcheck: pg_isready -U $POSTGRES_USER
    Volume: postgres_data (persistent)
    
  backend:
    build: ./backend (Dockerfile: node:20-alpine, npm ci, build, run)
    Depends: postgres (condition: service_healthy)
    Env: DATABASE_URL, AD_*, FILESERVER_*, PORT, JWT_SECRET
    Port: 3000
    
  frontend:
    build: ./frontend (Dockerfile: node build, serve dist)
    Depends: backend
    Env: VITE_API_BASE_URL
    Port: 5173
    
  pgadmin:
    image: dpage/pgadmin4:latest
    Depends: postgres
    Port: 5050
    Profile: tools (optional, enable with --profile tools)
```

---

## Data Flow Examples

### Inventory Collection
```
Client PowerShell
  ↓ (GET WMI classes)
JSON payload
  ↓ (POST /inventory)
Backend: InventoryService
  ↓ (transactional upsert)
Prisma: Device + children
  ↓ (calls SoftwareComplianceService)
Software compliance check
  ↓ (delta-detector)
ComplianceAlert (if new version detected)
  ↓
Frontend refreshes on next request
```

### AD Sync
```
Backend: POST /active-directory/sync
  ↓ (LDAP bind + search)
LdapClientService → ldapts
  ↓ (OU → Group → User queries)
Prisma: AdOrganizationalUnit, AdGroup, AdUser
  ↓ (manager DN resolution)
Org hierarchy stored
  ↓
Frontend dropdowns populated on onboarding page
```

### Onboarding
```
Frontend: submit OnboardingWizard
  ↓ (POST /onboarding)
OnboardingService.startOnboarding()
  ├─ ActiveDirectoryService.createUser() → LDAPS
  ├─ ActiveDirectoryService.addUserToGroupsAndSetManager() → LDAPS
  ├─ FileServerService.createUserFolder() → WinRM
  ├─ FileServerService.setNtfsPermissions() → WinRM
  └─ OnboardingLog entries for each step
  ↓
Return OnboardingRequest + logs
  ↓
Frontend shows success/failure
```

---

## Security Considerations

### Authentication & Authorization
- ❌ **Currently:** No user authentication (add JWT middleware in production)
- ✅ **Service Accounts:** AD service accounts for read/write
- ⚠️ **TODO:** Implement role-based access control (admin, manager, user)

### Encryption
- ✅ LDAPS (port 636) for AD communication
- ✅ WinRM HTTPS (port 5986) for file server
- ✅ unicodePwd (UTF-16LE) for password setting (requires LDAPS)
- ⚠️ **TODO:** Validate SSL certificates (not self-signed in production)

### Credential Management
- ✅ Service accounts in .env (use .env.local + .gitignore in production)
- ⚠️ **TODO:** Migrate to secrets manager (Vault, AWS Secrets Manager, etc.)
- ⚠️ **TODO:** Rotate service account passwords regularly

### Network
- ✅ Docker network isolation (backend ↔ AD/File Server, frontend ↔ backend)
- ⚠️ **TODO:** Add API rate limiting
- ⚠️ **TODO:** Add CORS policy
- ⚠️ **TODO:** Frontend behind reverse proxy/WAF

---

## Performance Considerations

### Database
- Indexes on frequently queried columns (computerName, lastSeenAt, deviceId)
- Transactions for atomic operations (onboarding workflow)
- Connection pooling (Prisma default: 5 connections)

### Sync Operations
- AD sync is read-only, can be parallelized
- LDAP search with paging (avoids size limits)
- Short-lived connections (no connection pooling overhead)

### Frontend
- Lazy loading of pages (React Router)
- Pagination on device list (take/skip parameters)
- No real-time updates (polling on demand)

---

## Testing

### Manual Testing Checklist

- [ ] **Inventory Collection:**
  - [ ] Run PowerShell collector manually
  - [ ] Verify POST /inventory succeeds
  - [ ] Check database for device record
  
- [ ] **AD Sync:**
  - [ ] POST /sync succeeds
  - [ ] Users/groups/OUs in database
  - [ ] Exclusion rules applied (no service accounts)
  
- [ ] **File Server:**
  - [ ] POST /discover-departments succeeds
  - [ ] Folders visible in dropdown
  
- [ ] **Onboarding:**
  - [ ] Fill wizard → check each step
  - [ ] Review page shows correct data
  - [ ] Submit → onboarding request created
  - [ ] Check AD user created + enabled
  - [ ] Check folder created on file server
  - [ ] Check NTFS permissions applied

### Automated Testing

- [ ] Unit tests for services (Jest)
- [ ] E2E tests for workflows (Cypress or Playwright)
- [ ] Database schema validation (Prisma)

---

## Future Enhancements

1. **Authentication & RBAC**
   - JWT tokens for frontend
   - Role-based access control (admin, manager, user)

2. **Email Notifications**
   - Welcome email on onboarding
   - Compliance alerts via email digest

3. **Audit Logging**
   - Log all API calls
   - Log all AD/file server operations
   - Compliance audit trail

4. **Export & Reporting**
   - Inventory reports (CSV, PDF)
   - Compliance reports
   - Onboarding audit trail

5. **macOS/Linux Support**
   - Extend PowerShell collector to Bash/Python
   - Support for non-Windows devices

6. **Slack/Teams Integration**
   - Alert webhooks
   - Onboarding notifications

7. **Scheduling**
   - Scheduled onboarding (bulk import from CSV)
   - Periodic AD sync (via cron job)

---

## Troubleshooting Decision Trees

### "Onboarding fails at Step 3"

```
Check: Is WinRM enabled on file server?
  ├─ YES → Check: Can backend reach server:5986?
  │         ├─ YES → Check: WinRM logs on file server
  │         │         └─ See: Connection refused
  │         └─ NO → Firewall block → check firewall rules
  └─ NO → Enable-PSRemoting on file server
```

### "Inventory POST returns 400"

```
Check: Is PowerShell output valid JSON?
  ├─ YES → Check: Does JSON match InventoryPayloadDto?
  │         ├─ YES → Check: Are all required fields present?
  │         │         └─ curl test with sample-payload.json
  │         └─ NO → Update PowerShell script fields
  └─ NO → Debug PowerShell script (run with -Verbose)
```

---

## Repository Structure

```
it-asset-platform/
├── backend/                   # NestJS application
│   ├── src/
│   │   ├── common/            # Shared services (LDAP, WinRM, Prisma)
│   │   ├── modules/           # Feature modules
│   │   ├── app.module.ts      # Root module
│   │   └── main.ts            # Bootstrap
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/                  # React + Vite application
│   ├── src/
│   │   ├── pages/             # Page components
│   │   ├── lib/               # API client
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── package.json
│   └── index.html
├── scripts/
│   ├── Collect-Inventory.ps1  # PowerShell collector
│   └── sample-inventory-payload.json
├── docs/
│   ├── SETUP.md               # Setup & deployment guide
│   └── ARCHITECTURE.md        # This file
├── docker-compose.yml
├── .env.example
├── Makefile
├── deploy.sh
├── README.md
└── .gitignore
```

---

This architecture supports a small-to-medium enterprise (1000–10,000 employees) with room for scaling.
