CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'CPANEL');
CREATE TYPE "CpanelAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'MISSING');

ALTER TABLE "AdminAccount"
ADD COLUMN "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "CpanelAccount" (
    "username" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "CpanelAccountStatus" NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itamAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CpanelAccount_pkey" PRIMARY KEY ("username"),
    CONSTRAINT "CpanelAccount_itamAccountId_fkey"
      FOREIGN KEY ("itamAccountId") REFERENCES "AdminAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CpanelAccount_itamAccountId_key" ON "CpanelAccount"("itamAccountId");
CREATE INDEX "CpanelAccount_status_idx" ON "CpanelAccount"("status");
CREATE INDEX "CpanelAccount_lastSeenAt_idx" ON "CpanelAccount"("lastSeenAt");
