ALTER TABLE "AdminAccount" ADD COLUMN "phone" TEXT;

ALTER TABLE "Ticket"
ADD COLUMN "requesterPhone" TEXT,
ADD COLUMN "assignedAt" TIMESTAMP(3),
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "waitingUserStartedAt" TIMESTAMP(3),
ADD COLUMN "waitingUserDurationMs" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "Ticket"
SET "assignedAt" = "createdAt"
WHERE "assignedAdminId" IS NOT NULL;

UPDATE "Ticket"
SET "closedAt" = "updatedAt"
WHERE "status" = 'CLOSED';

UPDATE "Ticket"
SET "waitingUserStartedAt" = "updatedAt"
WHERE "status" = 'WAITING_USER';
