ALTER TABLE "Ticket"
ADD COLUMN "ticketNumber" INTEGER;

CREATE SEQUENCE "Ticket_ticketNumber_seq" START WITH 100000;

ALTER TABLE "Ticket"
ALTER COLUMN "ticketNumber" SET DEFAULT nextval('"Ticket_ticketNumber_seq"');

ALTER SEQUENCE "Ticket_ticketNumber_seq"
OWNED BY "Ticket"."ticketNumber";

WITH numbered_tickets AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) + 99999)::INTEGER AS "ticketNumber"
  FROM "Ticket"
)
UPDATE "Ticket" AS ticket
SET "ticketNumber" = numbered_tickets."ticketNumber"
FROM numbered_tickets
WHERE ticket."id" = numbered_tickets."id";

SELECT setval(
  '"Ticket_ticketNumber_seq"',
  GREATEST(COALESCE((SELECT MAX("ticketNumber") FROM "Ticket"), 99999), 99999),
  TRUE
);

ALTER TABLE "Ticket"
ALTER COLUMN "ticketNumber" SET NOT NULL;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_ticketNumber_six_digits_check"
CHECK ("ticketNumber" BETWEEN 100000 AND 999999);

CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
