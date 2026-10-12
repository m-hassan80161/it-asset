ALTER TABLE "Ticket"
ADD COLUMN "resolvedById" TEXT;

UPDATE "Ticket"
SET "resolvedAt" = "updatedAt"
WHERE "status" IN ('RESOLVED', 'CLOSED')
  AND "resolvedAt" IS NULL;

UPDATE "Ticket"
SET "resolvedById" = "assignedAdminId"
WHERE "resolvedAt" IS NOT NULL
  AND "resolvedById" IS NULL
  AND "assignedAdminId" IS NOT NULL;

CREATE INDEX "Ticket_resolvedById_idx" ON "Ticket"("resolvedById");

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_resolvedById_fkey"
FOREIGN KEY ("resolvedById") REFERENCES "AdminAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
