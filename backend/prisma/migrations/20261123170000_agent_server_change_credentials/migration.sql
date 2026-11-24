CREATE TABLE "WindowsAgentServerChangeCredential" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "windowsAgentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WindowsAgentServerChangeCredential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WindowsAgentServerChangeCredential_windowsAgentId_fkey"
        FOREIGN KEY ("windowsAgentId") REFERENCES "WindowsAgent"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WindowsAgentServerChangeCredential_tokenHash_key"
    ON "WindowsAgentServerChangeCredential"("tokenHash");
CREATE INDEX "WindowsAgentServerChangeCredential_windowsAgentId_expiresAt_idx"
    ON "WindowsAgentServerChangeCredential"("windowsAgentId", "expiresAt");
CREATE INDEX "WindowsAgentServerChangeCredential_expiresAt_consumedAt_idx"
    ON "WindowsAgentServerChangeCredential"("expiresAt", "consumedAt");
