# Setup and Operations

## What is active

The platform currently provides IT inventory, employee/admin accounts,
branch-based tickets, and application logs. Registration verifies an email
address using a one-time code sent through SMTP.

Support admins can create tickets for callers, including employee name,
optional email, location, branch and department-based ticket titles, and an
editable opening date. Ticket contact phone numbers may contain a single
digit. Admin ticket lists
show tickets assigned to that admin and unassigned tickets in their branch;
the super administrator can see every branch. Managers can assign or
reassign tickets within their managed branches, and the receiving admin must
confirm acceptance before the ticket assignment changes. The staff-only
knowledge base supports search and PDF, PNG/JPEG, MP4, and WebM attachments
up to 25 MB per file.

Ticket creation is available on its own page, separate from the ticket
register. Tickets receive a chronological display code such as `000001A` while
their UUID remains the internal database identifier. Manager reports can be
filtered by date range, branch, and assigned admin; the closed archive combines
resolved and closed tickets, while monthly totals and repeated problem titles
use the selected report filters.

The tracked-asset registry is separate from automatically collected computer
inventory. It assigns unique type-based IDs such as `PRN-000001` and
`PC-000001`; this generated code is also the asset serial and printable
Code 128 barcode. Assets are linked to registered branches and can optionally
be linked to an administration and an employee. Employee name/email records
are reused by email or registered when first entered. The overview keeps
maintenance and location history concise; full history, maintenance invoices,
and condition photos are available on the asset detail page. Each photo
records its upload time and a snapshot of the asset's branch, administration,
and linked employee.
Search accepts keyboard-wedge USB scanners and includes an in-browser camera
scanner for Code 128 labels. Camera access requires browser permission and a
secure context (HTTPS, or localhost during local development).

Active Directory synchronization, LDAP connectivity, and AD-based onboarding
are removed. cPanel synchronization, mailbox-password login, and account
linking/provisioning are also removed. Previously imported cPanel records
remain in PostgreSQL and can be viewed by a super administrator; the app does
not make live cPanel calls. Legacy AD and onboarding tables are retained and
are not dropped by the new migration.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ if running the frontend/backend outside Docker
- PostgreSQL (provided by Compose for local development)
- An SMTP server that can send registration messages
- A configured branch and initial administrator account

## Configure and run locally

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Set secure values in `.env`, including:

   ```env
   POSTGRES_PASSWORD=use_a_unique_database_password
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=use_a_unique_password_at_least_12_characters
   EMAIL_VERIFICATION_SECRET=use_a_random_secret_at_least_32_characters
   MAIL_HOST=smtp.example.com
   MAIL_PORT=587
   MAIL_SECURE=false
   MAIL_USER=itam@example.com
   MAIL_PASSWORD=your_smtp_password
   MAIL_FROM=IT Asset Platform <itam@example.com>
   ```

   `MAIL_USER` and `MAIL_PASSWORD` can both be empty when the SMTP relay does
   not require authentication. Do not commit `.env` or paste secrets into the
   frontend configuration.

3. Start the development stack:

   ```bash
   ./scripts/setup-local-https.sh
   docker compose up -d --build
   ```

For an Agent connecting by the server's IPv4 address, generate a certificate
whose SAN includes that address and restart Nginx:

```bash
./scripts/setup-local-https.sh 10.22.28.82 --replace
docker compose restart nginx
```

The Agent MSI can install the public server certificate automatically. For
already-installed older MSIs, or for a manual installation, copy only
`nginx/certs/server.crt` to each Windows computer through a trusted
administrative channel; never copy `server.key`. In elevated PowerShell, trust
the self-signed certificate and restart the Agent:

```powershell
Import-Certificate -FilePath C:\secure\server.crt `
  -CertStoreLocation Cert:\LocalMachine\Root
Restart-Service -Name "ITAM Windows Agent"
```

The certificate must cover the exact DNS name or IP used by `ServerUrl`.
Because this local certificate is self-signed, clients must explicitly trust
it. For production, prefer a certificate issued by the organization's trusted
certificate authority rather than distributing a self-signed certificate.

The backend does not change the database schema automatically on startup.
Apply checked-in Prisma migrations explicitly with
`docker compose run --rm --no-deps backend npx prisma migrate deploy`.
Do not use `prisma db push` or `--accept-data-loss` for this database; the
ticket display number migration backfills existing rows before adding its
unique constraint. The tracked-asset migrations add the asset registry,
per-type ID counters, location history, maintenance records, employee links,
maintenance invoices, and condition photos. These migrations add new tables
and nullable asset fields; they do not reset existing inventory or tickets.

### Baseline a database previously managed with `db push`

If an existing database was created or updated with `prisma db push`, it has
no migration history, and `prisma migrate deploy` stops with `P3005`. Stop the
backend to prevent restart attempts, take a database backup, then compare the
live schema with the Prisma schema:

```bash
docker compose stop backend
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > itam-platform-before-baseline.sql
docker compose run --rm --no-deps backend sh -c \
  'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script'
```

Only continue if the diff contains no unexpected differences and the existing
schema does not already contain `Ticket.ticketNumber`. This one-time baseline
records the migrations already represented by the existing schema without
running their SQL. It intentionally leaves the ticket-number migration
unapplied so that `migrate deploy` can backfill existing tickets:

```bash
docker compose run --rm --no-deps backend sh -c '
  set -eu
  for migration in \
    0_init \
    20261005120000_add_admin_auth \
    20261005221500_add_device_components \
    20261005230000_add_component_specifications \
    20261007110000_add_component_source \
    20261009000000_add_tickets_logs \
    20261009010000_account_lifecycle_remote_support \
    20261009020000_branch_inventory_ticket_transfers \
    20261009030000_cpanel_identity_sync \
    20261009040000_cpanel_hosting_account_owner \
    20261009160000_branch_registry \
    20261009190000_ticket_resolution_owner \
    20261013120000_ticket_metrics_contact \
    20261013130000_dashboard_preferences \
    20261121150000_email_registration_verification \
    20261123100000_assisted_tickets_knowledge_base \
    20261123110000_optional_motherboard_serial_number
  do
    npx prisma migrate resolve --applied "$migration"
  done
'
docker compose run --rm --no-deps backend npx prisma migrate deploy
docker compose up -d backend
```

Do not mark `20261123120000_ticket_display_number` as applied: that migration
must run to assign unique display numbers to existing tickets when that
column is absent. If the schema diff shows unrelated changes, stop before
baselining and reconcile that database state. If `ticketNumber` already exists,
use the specific procedure below only when its schema-diff conditions match.

### Baseline when ticket numbers already exist

Some databases were updated with `db push` and already contain the
`Ticket.ticketNumber` column and its data, but do not have Prisma migration
history. If the read-only schema diff against the current Prisma schema shows
only the asset enum, tables, indexes, and foreign keys as missing, back up the
database, stop the backend, then mark the migrations already represented by
that schema as applied. In this case, include the ticket display-number
migration; do not mark the asset-registry migration as applied:

```bash
docker compose stop backend
docker compose run --rm --no-deps backend sh -c '
  set -eu
  for migration in \
    0_init \
    20261005120000_add_admin_auth \
    20261005221500_add_device_components \
    20261005230000_add_component_specifications \
    20261007110000_add_component_source \
    20261009000000_add_tickets_logs \
    20261009010000_account_lifecycle_remote_support \
    20261009020000_branch_inventory_ticket_transfers \
    20261009030000_cpanel_identity_sync \
    20261009040000_cpanel_hosting_account_owner \
    20261009160000_branch_registry \
    20261009190000_ticket_resolution_owner \
    20261013120000_ticket_metrics_contact \
    20261013130000_dashboard_preferences \
    20261121150000_email_registration_verification \
    20261123100000_assisted_tickets_knowledge_base \
    20261123110000_optional_motherboard_serial_number \
    20261123120000_ticket_display_number
  do
    npx prisma migrate resolve --applied "$migration"
  done
'
docker compose run --rm --no-deps backend npx prisma migrate deploy
docker compose up -d backend
```

This records the existing schema as the migration baseline. `migrate deploy`
then runs the asset-registry migration normally, creating its tables without
dropping or resetting existing application data. Do not use this procedure if
the schema diff contains anything beyond the asset-registry objects described
above.

   Development Compose starts PostgreSQL and the backend/frontend containers.
   The backend does not apply Prisma migrations at startup. Open
   `https://localhost:8443`; the local self-signed certificate will show a
   browser warning until you explicitly trust it. Plain HTTP on port 8080
   redirects to HTTPS.

   If the existing backend container reports a missing package after updating
   dependencies, refresh its anonymous dependency volume:

   ```bash
   docker compose up -d --build --renew-anon-volumes backend nginx
   ```

4. Open the frontend at `http://localhost:5173` or the configured Nginx
   endpoint at `http://localhost:8080`. The API is available at
   `http://localhost:3000/api/v1`; Swagger
   documentation is at `http://localhost:3000/api/docs`.

5. Sign in with the initial super administrator configured by
   `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Create at least one branch from the
   branch settings page before employee registration. New self-registered
   accounts always receive the `EMPLOYEE` role; administrators assign any
   elevated role later.

## Email verification and registration

The registration page first requests an email code, then collects the code,
full name, branch, and password. Codes expire after 10 minutes. A code can be
resent after 60 seconds, up to three requests per email per hour; verification
is limited to five attempts. The backend stores an HMAC of the code, never the
plain code.

If registration fails, check:

- SMTP host/from and port are configured.
- SMTP credentials are either both configured or both empty.
- `EMAIL_VERIFICATION_SECRET` is a private value of at least 32 characters and
  is the same across all backend instances.
- Outbound SMTP traffic is allowed from the backend.
- At least one branch has been created.

In production, add `EMAIL_VERIFICATION_SECRET`, `MAIL_HOST`, `MAIL_PORT`,
`MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, and (when enabling
Windows Agent updates) `AGENT_UPDATE_PUBLIC_KEY` to the GitHub Actions secrets
used by the deploy workflow. The deploy workflow writes them to the
server-side `.env`; keep this file restricted and do not publish SMTP
credentials or signing keys.

## Inventory collection

The PowerShell collector reports hardware/software snapshots to
`POST /api/v1/inventory`. Continue to deploy
[`scripts/Collect-Inventory.ps1`](../scripts/Collect-Inventory.ps1) to
workstations as appropriate while evaluating the new agent. The existing
PowerShell endpoint and its computer-name identity are unchanged.

### New Windows Agent (parallel rollout)

The new .NET 10 Worker Service is isolated from the PowerShell collector. It
registers a stable installation ID, records active MAC addresses as the
device lookup identity, sends a heartbeat every minute, and refreshes the
hardware/software snapshot every six hours. The dashboard considers a device
online when its last heartbeat was within five minutes. Hardware/software
snapshots include CPU, motherboard, memory, logical disks, and machine-wide
installed software; the signed-in user and Windows domain are also reported.

Apply the additive `20261123150000_windows_agent_platform` Prisma migration
before enabling the new agent endpoints. Back up PostgreSQL first and use
`prisma migrate deploy`; do not use `db push` or reset the database. The new
agent records are stored in dedicated tables and do not rewrite or merge
existing `Device` rows, so PowerShell and Windows Agent can run in parallel.

Generate a dedicated RSA release-signing key pair outside the repository. Keep
the private key offline or in a restricted release system; configure the
server with the base64-encoded public PEM in `AGENT_UPDATE_PUBLIC_KEY`. Mount
the persistent `agent_release_data` volume for MSI packages. The same public
key must be embedded in the MSI at build time:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out agent-release-private.pem
openssl pkey -in agent-release-private.pem -pubout -out agent-update-public.pem
base64 -w0 agent-update-public.pem
```

Set the printed base64 value as `AGENT_UPDATE_PUBLIC_KEY`, then restart the
backend. Build the MSI on Windows with .NET 10 SDK, the public PEM, and the default
server URL:

```powershell
.\agent\build-agent.ps1 `
  -AgentUpdatePublicKeyFile C:\secure\agent-update-public.pem `
  -ServerCertificateFile C:\secure\server.crt `
  -ServerUrl https://itam.example.com:8443 `
  -Version 1.0.1
```

`ServerCertificateFile` must be a single public PEM X.509 certificate whose
SAN covers the build-time server URL. The build rejects private-key material,
converts the certificate to DER for the MSI, and WiX installs it to
`Local Computer\Trusted Root Certification Authorities` during installation.
Do not pass or distribute `server.key`. When the server certificate changes,
rebuild and redeploy the MSI (or install the new public certificate through
your organization's device-management process).

Copy the `agent` source folder and the public PEM to the Windows build
computer, along with the server's public `server.crt`; these paths are on that
computer. Do not copy generated
`bin` or `obj` folders as build inputs. If they are present, the build script
removes the Agent and installer caches before building, so NuGet/MSBuild
regenerates files such as `project.assets.json` with paths for the current
computer. Restore/build outputs and the MSI remain under the copied `agent`
folder; no source file depends on the original developer's workspace path.

The installer is x64 and targets Windows 10/11 and Windows Server. Install it
directly from the generated MSI, or override the build-time server for a
specific installation. The chosen server URL must match the bundled
certificate, unless that server already chains to a certificate trusted by
Windows. Enrollment happens automatically after installation:

```powershell
msiexec /i .\agent\dist\ITAM.WindowsAgent.msi /qn
msiexec /i .\agent\dist\ITAM.WindowsAgent.msi SERVER_URL="https://other.example.com" /qn
```

The MSI also installs a separate Windows tray app and starts it at the next
interactive Windows sign-in. Its icon appears in the notification area beside
the clock/network icons (it may be under the hidden-icons arrow). Double-click
the icon to see the service state, configured server, HTTPS reachability, and
the latest Agent warning/error from Windows Application events. The tray app
does not replace the background Windows service.

To change the server from the tray window, enter the new HTTPS origin and
choose **تغيير السيرفر**. Approve the Windows administrator prompt, then enter
the one-time credential from the web console in the PowerShell window that
opens. Closing the status window hides it while leaving the tray icon active;
exiting the tray app stops only the UI, not the Windows service. The tray app
starts automatically at the next interactive sign-in; launch
`Tray\ITAM.WindowsAgent.Tray.exe` from the install folder to open it sooner.

The server URL must be HTTPS with a certificate trusted by Windows. HTTP is
allowed only for loopback development. The current production workflow
generates a self-signed TLS certificate; the MSI can add its public certificate
to the Local Computer Trusted Root Certification Authorities store. Prefer a
certificate issued by the organization's trusted CA for production. Never
disable certificate checks. The server URL is not a secret and can be read by a local
administrator from the MSI command line or Windows registry. Enrollment
creates a unique random credential for that installation; the server stores
only its hash, and the agent protects the credential with Windows DPAPI for
the service account. An installation ID can enroll only once, preventing an
unauthenticated re-enrollment from replacing an existing agent credential.
The admin console can disable an agent and reject its credential.

On enrollment and every six hours, the Agent also writes its complete inventory
to the same device, hardware, disk, and installed-software tables used by the
PowerShell collector. Apply the checked-in Prisma migrations before deploying
the backend update. New builds identify laptop/PC form factor and report
physical disk model type, serial number, capacity, and free space.

The installed server URL can be changed locally in
`HKLM\SOFTWARE\ITAM\WindowsAgent\ServerUrl`, but use the included
`Change-ITAMAgentServer.ps1` helper so the change is authorized. In the Agent
console, create a one-time server-change credential for the target device.
On that device, open an elevated PowerShell window and run:

```powershell
.\Change-ITAMAgentServer.ps1 -ServerUrl https://new-itam.example.com:8443
```

The helper prompts for the credential without echoing it, validates it with
the current server over HTTPS, and only then updates the URL and restarts the
service. If the new URL points to a different database, the Agent automatically
enrolls there and receives a new per-agent credential; if it is the same
database, its existing credential continues to work. Credentials are bound to one
registered Agent, stored hashed, usable once, and expire after 15 minutes.
The new server URL must be an HTTPS origin trusted by Windows. The web console
can disable an Agent, which also prevents issuing or using a server-change
credential.

#### Deploying through Group Policy

1. Put the MSI beside the startup script in SYSVOL, or on another read-only
   share accessible to target computer accounts. The default script path looks
   for the MSI beside the script; pass `-MsiPath` to use another location.
2. The MSI uses its build-time server URL by default. Pass `-ServerUrl` to the
   script only if this GPO should override that value.
3. Store the startup script in the GPO's `Computer Configuration → Policies →
   Windows Settings → Scripts (Startup/Shutdown) → Startup` section. Configure
   PowerShell startup scripts to run, link the GPO to the intended computer
   OU, and test with a small pilot OU first.
4. Ensure the MSI is reachable by target computers and contains the public
   certificate matching the selected server URL before applying the GPO.

The startup script needs only the server URL and MSI path. A computer that
can reach the enrollment endpoint can register a new installation; it receives
only its own credential and inventory access. Keep the enrollment endpoint
reachable only on networks where you intend to install agents, since machines
outside that trust boundary can also attempt to register themselves.

To publish an update, increment the MSI version, rebuild it, and sign the
exact MSI bytes with the offline private key:

```bash
openssl dgst -sha256 -sign agent-release-private.pem -out agent.msi.sig agent.msi
openssl base64 -A -in agent.msi.sig -out agent.msi.sig.txt
```

Upload the MSI and `.sig.txt` from the web console. The server verifies the
detached RSA/SHA-256 signature before saving the package. Agents check for
releases every ten minutes, download over HTTPS, verify both SHA-256 and the
signature against the embedded public key, and only then invoke Windows
Installer. Do not publish private signing keys or MSI files containing
secrets in source control. Authenticode-signing the MSI
with your organization’s Windows code-signing certificate is also recommended.

The MSI installer itself is a Windows artifact and must be built and tested on
a Windows machine before rollout. Begin with a small pilot group; leave the
PowerShell collector deployed until the new agent’s inventory and updates are
verified. The new agent does not execute remote commands.

## cPanel Mails

The admin navigation contains **cPanel Mails**, a searchable registry used
when opening support tickets. Support admins can add an email address while
entering a ticket, search saved records by email, domain, or hosting account,
and delete a saved registry entry. Deleting an entry does not delete the real
mailbox or the related internal user account. The registry does not connect to
cPanel or change mailbox credentials.
The existing `CpanelAccount` data and its historical relation to any internal
account are retained. Historical cPanel accounts no longer authenticate with
mailbox passwords. An active legacy employee account without a local password
can be claimed through email verification; its employee role and an existing
assigned branch are preserved.

## Database migrations and production deployment

The new registration migration creates the email verification challenge table
only. It does not delete or transform existing accounts, cPanel records, AD
cache data, or onboarding history.

Production deployment:

- Runs on a self-hosted Linux x64 GitHub Actions runner with access to the
  production Docker Compose stack and its persistent PostgreSQL volume.
- Builds and publishes backend, frontend, and Nginx images from the same
  checked-out commit, then deploys those immutable commit-tagged images.
- Backs up PostgreSQL before applying Prisma migrations.
- Applies migrations before starting the application and verifies that the
  ticket-number, tracked-asset, and Agent form-factor schema is present.
- Fails before starting the backend if the migrations are missing or the
  database schema does not match the application release.
- Does not run `prisma db push` against the production database.
- Runs only for pushes to `main` or an explicit manual workflow dispatch; pull
  requests do not deploy production.

The `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` deployment secrets
must match the existing production database. Changing `POSTGRES_DB` does not
rename or create a database in an already initialized PostgreSQL data volume.
Do not use `prisma db push --force-reset` to address a connection or migration
error.

Do not delete the legacy Prisma models or tables if the historical records
must remain available. Take a verified backup before applying future schema
changes.

## API endpoints

### Public

- `POST /api/v1/auth/login` — Local username/email and password login.
- `GET /api/v1/auth/registration/branches` — Branch options for signup.
- `POST /api/v1/auth/registration/code` — Request an email verification code.
- `POST /api/v1/auth/registration/complete` — Verify the code and create an
  `EMPLOYEE` account.
- `POST /api/v1/inventory` — Ingest a device inventory snapshot.
- `POST /api/v1/windows-agent/enroll` — One-time-token enrollment for the new
  Windows Agent.
- `/api/v1/windows-agent/heartbeat` — Per-agent authenticated heartbeat and
  inventory snapshot.

Example request sequence:

```bash
curl -X POST http://localhost:3000/api/v1/auth/registration/code \
  -H 'Content-Type: application/json' \
  -d '{"email":"employee@example.com"}'

curl -X POST http://localhost:3000/api/v1/auth/registration/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"employee@example.com",
    "code":"123456",
    "fullName":"Example Employee",
    "password":"replace_with_a_long_password",
    "branch":"Configured Branch"
  }'
```

### Authenticated

- `/api/v1/auth/users` — Account management according to the caller's role.
- `/api/v1/auth/settings` — Current account settings.
- `/api/v1/tickets` — Ticket creation and role-scoped listing/actions.
- `/api/v1/knowledge-base` — Search and manage support knowledge articles
  (authenticated support staff only).
- `/api/v1/inventory` — Device listing and management.
- `/api/v1/agent-management` — Admin-only Windows Agent status, enrollment,
  enable/disable, and signed MSI publishing.
- `GET /api/v1/auth/cpanel/accounts` — Super-administrator-only historical
  cPanel records.

Active Directory and onboarding endpoints are not registered.

## Troubleshooting

| Symptom | Check |
|---|---|
| Registration does not send a code | SMTP settings, relay connectivity, backend logs, and `EMAIL_VERIFICATION_SECRET`. |
| No branch is available in signup | Sign in as super administrator and create a branch. |
| A code is rejected | Confirm it is for the same email, not expired, and entered within the five-attempt limit. Request a replacement after the resend delay. |
| Inventory agent receives an error | Validate the collector payload and inspect `docker logs itam_backend`. |
| API cannot reach PostgreSQL | Check Compose health and `DATABASE_URL`. |
| Existing cPanel account cannot log in | cPanel passwords are no longer used. Claim eligible legacy employee accounts with email verification. |

Useful commands:

```bash
docker compose ps
docker logs itam_backend --tail 200
docker exec -it itam_postgres psql -U itam_admin -d itam_platform
```

## Backups

```bash
docker exec itam_postgres pg_dump -U itam_admin itam_platform > backup.sql
docker exec -i itam_postgres psql -U itam_admin -d itam_platform < backup.sql
```
