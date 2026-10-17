CREATE TYPE "BranchPatternSource" AS ENUM ('DOMAIN', 'COMPUTER_NAME');
CREATE TYPE "TicketTransferRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "BranchPattern" (
    "id" TEXT NOT NULL,
    "source" "BranchPatternSource" NOT NULL,
    "pattern" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BranchPattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchPattern_source_pattern_key" ON "BranchPattern"("source", "pattern");
CREATE INDEX "BranchPattern_branch_idx" ON "BranchPattern"("branch");

CREATE TABLE "TicketTransferRequest" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "requestedByAdminId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterUsername" TEXT NOT NULL,
    "targetAdminId" TEXT,
    "targetName" TEXT NOT NULL,
    "targetUsername" TEXT NOT NULL,
    "status" "TicketTransferRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    CONSTRAINT "TicketTransferRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketTransferRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketTransferRequest_requestedByAdminId_fkey" FOREIGN KEY ("requestedByAdminId") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TicketTransferRequest_targetAdminId_fkey" FOREIGN KEY ("targetAdminId") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TicketTransferRequest_ticketId_status_idx" ON "TicketTransferRequest"("ticketId", "status");
CREATE INDEX "TicketTransferRequest_targetAdminId_status_idx" ON "TicketTransferRequest"("targetAdminId", "status");

ALTER TABLE "Ticket"
ADD COLUMN "assignedAdminName" TEXT,
ADD COLUMN "assignedAdminUsername" TEXT;

ALTER TABLE "Ticket"
DROP CONSTRAINT IF EXISTS "Ticket_assignedAdminId_fkey",
ADD CONSTRAINT "Ticket_assignedAdminId_fkey"
FOREIGN KEY ("assignedAdminId") REFERENCES "AdminAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ticket"
DROP CONSTRAINT IF EXISTS "Ticket_managerId_fkey",
ADD CONSTRAINT "Ticket_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "AdminAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
