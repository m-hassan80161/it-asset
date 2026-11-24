CREATE TABLE "AssetEmployee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetMaintenanceInvoice" (
    "id" TEXT NOT NULL,
    "maintenanceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileData" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetMaintenanceInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetPhoto" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileData" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "caption" TEXT,
    "location" TEXT NOT NULL,
    "department" TEXT,
    "employeeName" TEXT,
    "employeeEmail" TEXT,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetPhoto_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrackedAsset"
ADD COLUMN "branch" TEXT,
ADD COLUMN "department" TEXT,
ADD COLUMN "employeeId" TEXT,
ADD COLUMN "manufacturerSerialNumber" TEXT;

UPDATE "TrackedAsset"
SET "branch" = "location",
    "manufacturerSerialNumber" = CASE
      WHEN "serialNumber" IS NOT NULL AND "serialNumber" <> "assetCode" THEN "serialNumber"
      ELSE "manufacturerSerialNumber"
    END,
    "serialNumber" = "assetCode"
WHERE "branch" IS NULL OR "serialNumber" IS DISTINCT FROM "assetCode";

ALTER TABLE "AssetLocationHistory"
ADD COLUMN "fromDepartment" TEXT,
ADD COLUMN "toDepartment" TEXT,
ADD COLUMN "fromEmployeeName" TEXT,
ADD COLUMN "fromEmployeeEmail" TEXT,
ADD COLUMN "toEmployeeName" TEXT,
ADD COLUMN "toEmployeeEmail" TEXT;

CREATE UNIQUE INDEX "AssetEmployee_email_key" ON "AssetEmployee"("email");
CREATE INDEX "TrackedAsset_manufacturerSerialNumber_idx" ON "TrackedAsset"("manufacturerSerialNumber");
CREATE INDEX "TrackedAsset_branch_idx" ON "TrackedAsset"("branch");
CREATE INDEX "TrackedAsset_employeeId_idx" ON "TrackedAsset"("employeeId");
CREATE INDEX "AssetMaintenanceInvoice_maintenanceId_idx" ON "AssetMaintenanceInvoice"("maintenanceId");
CREATE INDEX "AssetPhoto_assetId_createdAt_idx" ON "AssetPhoto"("assetId", "createdAt");

ALTER TABLE "TrackedAsset"
ADD CONSTRAINT "TrackedAsset_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "AssetEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetMaintenanceInvoice"
ADD CONSTRAINT "AssetMaintenanceInvoice_maintenanceId_fkey"
FOREIGN KEY ("maintenanceId") REFERENCES "AssetMaintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetPhoto"
ADD CONSTRAINT "AssetPhoto_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "TrackedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
