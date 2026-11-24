CREATE TABLE "WindowsAgent" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "computerName" TEXT NOT NULL,
    "primaryMac" TEXT,
    "macAddresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "loggedInUser" TEXT,
    "domain" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "agentVersion" TEXT NOT NULL,
    "snapshot" JSONB,
    "secretHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInventoryAt" TIMESTAMP(3),
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WindowsAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WindowsAgentEnrollment" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WindowsAgentEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WindowsAgentRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WindowsAgentRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WindowsAgent_installId_key" ON "WindowsAgent"("installId");
CREATE UNIQUE INDEX "WindowsAgent_secretHash_key" ON "WindowsAgent"("secretHash");
CREATE INDEX "WindowsAgent_lastSeenAt_idx" ON "WindowsAgent"("lastSeenAt");
CREATE INDEX "WindowsAgent_primaryMac_idx" ON "WindowsAgent"("primaryMac");
CREATE UNIQUE INDEX "WindowsAgentEnrollment_tokenHash_key" ON "WindowsAgentEnrollment"("tokenHash");
CREATE INDEX "WindowsAgentEnrollment_expiresAt_consumedAt_idx" ON "WindowsAgentEnrollment"("expiresAt", "consumedAt");
CREATE UNIQUE INDEX "WindowsAgentRelease_version_key" ON "WindowsAgentRelease"("version");
CREATE INDEX "WindowsAgentRelease_publishedAt_idx" ON "WindowsAgentRelease"("publishedAt");
