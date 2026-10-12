ALTER TABLE "CpanelAccount"
ADD COLUMN "hostingAccountUsername" TEXT;

CREATE INDEX "CpanelAccount_hostingAccountUsername_idx"
ON "CpanelAccount"("hostingAccountUsername");
