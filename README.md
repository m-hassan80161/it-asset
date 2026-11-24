# IT Asset Management Platform

Containerized platform for device inventory, software tracking, branch-based
support tickets, user accounts, and application logs.

## Current features

- **Inventory:** Windows PowerShell collection of hardware and installed
  software, device details, manual component records, and change history.
- **Accounts:** Local password login and self-registration with an email
  verification code. Every self-registered account is created as an
  `EMPLOYEE`; administrators manage branches and elevated roles.
- **Tickets:** Employee requests and admin phone-call tickets, admin-owned
  ticket queues, manager assignment with recipient acceptance, editable
  opening dates, six-digit chronological ticket numbers, comments, attachments,
  and resolution history. Manager reports include date-range and assignee
  filters, monthly totals, repeated problems, and branch/admin rankings.
- **Knowledge base:** Searchable problem-and-solution articles for support staff
  with PDF, image, and MP4/WebM video attachments (25 MB per file).
- **cPanel Mails:** Searchable email registry for assisted ticket creation.
  New email addresses can be saved for future selection, searched, and removed
  from the registry; no cPanel synchronization, mailbox-password login,
  linking, or provisioning is active.

Active Directory synchronization, LDAP integration, and AD-based onboarding
have been removed. Legacy cPanel, AD, and onboarding database records remain
in place; the current migrations do not drop those historical tables.

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Backend | NestJS, Express, Prisma |
| Database | PostgreSQL |
| Deployment | Docker Compose, Nginx |
| Legacy device collection | PowerShell |
| New Windows Agent | .NET 10 Worker Service, Windows MSI |
| Signup email | SMTP |

## Quick start

Requirements: Docker and Docker Compose.

```bash
cp .env.example .env
# Set unique database/admin passwords, SMTP values, and EMAIL_VERIFICATION_SECRET.
docker compose up -d --build
```

Open the frontend at `http://localhost:5173` or the configured Nginx endpoint.
API documentation is available at `http://localhost:3000/api/docs`.

The initial super administrator is created from `ADMIN_USERNAME` and
`ADMIN_PASSWORD` the first time the backend starts. Sign in, configure at least
one branch, then users can register from the sign-in page. Self-registration
does not grant administrator or manager access.

See [docs/SETUP.md](./docs/SETUP.md) for SMTP configuration, API endpoints,
production deployment, and troubleshooting. See
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for runtime boundaries and
legacy data-retention details.

## Email registration settings

Configure these values in `.env`:

```env
EMAIL_VERIFICATION_SECRET=replace_with_a_random_secret_at_least_32_characters
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=itam@example.com
MAIL_PASSWORD=replace_me
MAIL_FROM=IT Asset Platform <itam@example.com>
```

SMTP username and password may both be empty when using a trusted relay.
Verification codes expire after ten minutes, have a resend delay and hourly
send limit, and are stored only as an HMAC. In production, configure these
values as deployment secrets; never commit `.env`.

## Main endpoints

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/registration/branches`
- `POST /api/v1/auth/registration/code`
- `POST /api/v1/auth/registration/complete`
- `POST /api/v1/inventory` — PowerShell agent ingestion
- `/api/v1/windows-agent` — one-time enrollment and per-agent authenticated
  heartbeat/release downloads
- `/api/v1/agent-management` — admin-only agent status and signed update
  publishing
- `/api/v1/tickets` — Authenticated ticket operations
- `GET /api/v1/auth/cpanel/accounts` — Read-only historical archive for
  super administrators

There are no active Active Directory synchronization or onboarding endpoints.

## Data preservation

The registration migration adds `EmailVerificationChallenge`. The Windows
Agent migration adds its own enrollment, heartbeat, and release tables; it
does not delete or rewrite existing inventory, tickets, cPanel imports,
internal accounts, AD caches, or onboarding records. A verified registration
can convert an active legacy cPanel-imported employee without a local password
to local authentication; the account stays an employee, and any already
assigned branch is preserved.

## Device management

The legacy PowerShell collector is in
[`scripts/Collect-Inventory.ps1`](./scripts/Collect-Inventory.ps1); its reports
remain keyed by computer name. The new Windows Agent is a separate .NET
service keyed by a stable install identity and indexed by its MAC addresses.
The two systems can run in parallel while the new agent is piloted. Admins can
inspect hardware/software snapshots, maintain manually managed peripherals,
and review the component change history.
