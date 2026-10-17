CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'ADMIN', 'MANAGER', 'SUPER_ADMIN');
CREATE TYPE "TicketCategory" AS ENUM ('HARDWARE', 'SOFTWARE', 'NETWORK', 'PRINTER', 'OTHER');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARNING', 'ERROR', 'DEBUG');
CREATE TYPE "LogSource" AS ENUM ('FRONTEND', 'BACKEND', 'DATABASE', 'API');

ALTER TABLE "AdminAccount"
ADD COLUMN "fullName" TEXT NOT NULL DEFAULT 'System Administrator',
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'SUPER_ADMIN',
ADD COLUMN "branch" TEXT,
ADD COLUMN "managedBranches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "requesterId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "departmentId" TEXT,
    "assignedAdminId" TEXT,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "AdminAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ApplicationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "level" "LogLevel" NOT NULL,
    "source" "LogSource" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "stackTrace" TEXT,
    "duration" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseTime" INTEGER,
    "endpoint" TEXT,
    "statusCode" INTEGER,
    CONSTRAINT "ApplicationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Ticket_requesterId_idx" ON "Ticket"("requesterId");
CREATE INDEX "Ticket_assignedAdminId_idx" ON "Ticket"("assignedAdminId");
CREATE INDEX "Ticket_managerId_idx" ON "Ticket"("managerId");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_branch_idx" ON "Ticket"("branch");
CREATE INDEX "TicketComment_ticketId_idx" ON "TicketComment"("ticketId");
CREATE INDEX "TicketComment_authorId_idx" ON "TicketComment"("authorId");
CREATE INDEX "ApplicationLog_level_idx" ON "ApplicationLog"("level");
CREATE INDEX "ApplicationLog_source_idx" ON "ApplicationLog"("source");
CREATE INDEX "ApplicationLog_timestamp_idx" ON "ApplicationLog"("timestamp");
CREATE INDEX "ApplicationLog_userId_idx" ON "ApplicationLog"("userId");
