# Current Implementation Summary

## Running application

- **Frontend:** React, TypeScript, Vite, TailwindCSS.
- **Backend:** NestJS with authentication, inventory, ticketing, and logging
  modules.
- **Database:** PostgreSQL managed through Prisma and SQL migrations.
- **Deployment:** Development and production Docker Compose configurations
  with Nginx in front of the web application and API.

## Account and registration behavior

- Initial system administrator is bootstrapped from `ADMIN_USERNAME` and
  `ADMIN_PASSWORD`.
- Public registration sends a one-time email code through SMTP.
- Verification codes are HMAC-protected, expire after ten minutes, have
  resend/hourly limits, and allow at most five attempts.
- New self-registered accounts are always `EMPLOYEE`.
- Account administration remains responsible for role elevation and branch
  assignment.
- Active legacy cPanel-imported employee accounts without a local password
  can be claimed after email verification. Their role and any pre-assigned
  branch are preserved.

## Retired integrations

- Active Directory synchronization, LDAP access, and AD-based onboarding are
  no longer loaded by the application.
- cPanel synchronization, IMAP password authentication, mailbox linking, and
  provisioning are removed.
- Super administrators can view a read-only archive of previously imported
  cPanel records.
- Legacy cPanel, AD, and onboarding database tables remain in the Prisma
  schema to preserve existing data. The current migration adds only the
  registration challenge table.

## Configuration and deployment

Configure SMTP and a private `EMAIL_VERIFICATION_SECRET` in `.env` for local
development and in deployment secrets for production. The production workflow
backs up PostgreSQL and applies Prisma migrations before starting the new
application image.

Refer to [README.md](./README.md),
[docs/SETUP.md](./docs/SETUP.md), and
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for current setup and behavior.
