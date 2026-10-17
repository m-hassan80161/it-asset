CREATE TYPE "RemoteSupportType" AS ENUM ('VNC', 'ANYDESK');

ALTER TABLE "AdminAccount"
ADD COLUMN "deleteAfter" TIMESTAMP(3);

ALTER TABLE "Ticket"
ADD COLUMN "remoteSupportType" "RemoteSupportType",
ADD COLUMN "remoteSupportId" TEXT,
ADD COLUMN "requesterUsername" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "requesterName" TEXT NOT NULL DEFAULT 'Unknown user';

UPDATE "Ticket" AS ticket
SET "requesterUsername" = account."username",
    "requesterName" = account."fullName"
FROM "AdminAccount" AS account
WHERE ticket."requesterId" = account."id";

ALTER TABLE "Ticket"
ALTER COLUMN "requesterId" DROP NOT NULL;

ALTER TABLE "Ticket"
DROP CONSTRAINT IF EXISTS "Ticket_requesterId_fkey",
ADD CONSTRAINT "Ticket_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "AdminAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TicketComment"
ADD COLUMN "authorUsername" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "authorName" TEXT NOT NULL DEFAULT 'Unknown user';

UPDATE "TicketComment" AS comment
SET "authorUsername" = account."username",
    "authorName" = account."fullName"
FROM "AdminAccount" AS account
WHERE comment."authorId" = account."id";

ALTER TABLE "TicketComment"
ALTER COLUMN "authorId" DROP NOT NULL;

ALTER TABLE "TicketComment"
DROP CONSTRAINT IF EXISTS "TicketComment_authorId_fkey",
ADD CONSTRAINT "TicketComment_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "AdminAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AdminAccount_isActive_deleteAfter_idx"
ON "AdminAccount"("isActive", "deleteAfter");
