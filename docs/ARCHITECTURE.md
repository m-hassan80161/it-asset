# Architecture

## Current runtime

The running application is a React/TypeScript frontend, a NestJS API, and a
PostgreSQL database accessed through Prisma. Docker Compose provides the local
development stack; production uses the prebuilt images and applies Prisma
migrations during deployment.

The active backend modules are:

- **Authentication** — local password authentication, role checks, sessions,
  email-code registration, and a read-only view of historical cPanel mailbox
  imports.
- **Inventory** — PowerShell agent ingestion, device and component management,
  and inventory queries.
- **Tickets** — employee ticket creation, branch-scoped administration,
  comments, attachments, assignment, and transfers. A sequential six-digit
  display number is separate from the UUID primary key. Manager reporting
  aggregates monthly volume, repeated problem titles, branches, and assignees
  using the same scope and filters as the ticket list.
- **Logs** — backend and frontend operational/audit logs.

The frontend includes the ticket dashboards, user/account management,
inventory, settings, and the historical cPanel archive. Account registration
creates `EMPLOYEE` accounts only; role elevation remains an administrator
operation. The initial system administrator is bootstrapped separately from
`ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Email registration

1. The unauthenticated registration page loads the configured branch list.
2. The applicant requests a code for an email address.
3. The backend stores only an HMAC of the code, expires it after 10 minutes,
   and sends the code through the configured SMTP server.
4. The applicant submits the code, name, branch, and password.
5. The backend validates and consumes the code atomically, then creates an
   `EMPLOYEE` account with a scrypt password hash.

Codes are limited to three sends per email in an hour, with a 60-second
resend delay and five verification attempts. Existing local accounts are not
re-registered. An active legacy cPanel-imported employee without a local
password can claim that existing account after verifying its email; its
employee role and any administrator-assigned branch are preserved.

## Retired integrations and retained data

Active Directory synchronization, LDAP access, and AD-based onboarding are no
longer registered or exposed by the application. cPanel UAPI synchronization,
IMAP password authentication, and account link/provision actions have also
been removed. The `CpanelAccount` records and legacy AD/onboarding tables stay
in the Prisma schema and database to avoid deleting existing data. The
super-administrator cPanel page is read-only and displays the saved cPanel
history; no live cPanel calls are made.

## Persistence and deployment

Prisma models and ordered SQL migrations define the database. The email
registration migration adds only `EmailVerificationChallenge`; it does not
drop or rewrite historical cPanel, AD, or onboarding records. Production
deployment backs up PostgreSQL before applying migrations. Do not remove the
legacy models or create destructive migrations unless historical-data removal
is explicitly intended.

## Configuration boundaries

- `EMAIL_VERIFICATION_SECRET` is a private random secret of at least 32
  characters used to HMAC verification codes.
- `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, and
  `MAIL_FROM` configure SMTP. User/password may both be empty for a trusted
  relay that does not require SMTP authentication.
- `.env` is ignored by Git. Production values belong in the deployment
  environment/secrets, not source control.
- Production is served behind Nginx HTTPS. Session cookies are HttpOnly and
  Secure in production.
