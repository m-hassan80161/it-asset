CREATE TYPE "AssetType" AS ENUM ('PRINTER', 'SCANNER', 'PC', 'MONITOR', 'OTHER');

CREATE TABLE "AssetCodeCounter" (
    "type" "AssetType" NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AssetCodeCounter_pkey" PRIMARY KEY ("type")
);

CREATE TABLE "TrackedAsset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "modelName" TEXT NOT NULL,
    "serialNumber" TEXT,
    "location" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrackedAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetLocationHistory" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT NOT NULL,
    "changedById" TEXT,
    "changedByName" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetLocationHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetMaintenance" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "maintenanceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrackedAsset_assetCode_key" ON "TrackedAsset"("assetCode");
CREATE INDEX "TrackedAsset_type_modelName_idx" ON "TrackedAsset"("type", "modelName");
CREATE INDEX "TrackedAsset_serialNumber_idx" ON "TrackedAsset"("serialNumber");
CREATE INDEX "TrackedAsset_location_idx" ON "TrackedAsset"("location");
CREATE INDEX "AssetLocationHistory_assetId_changedAt_idx" ON "AssetLocationHistory"("assetId", "changedAt");
CREATE INDEX "AssetMaintenance_assetId_maintenanceDate_idx" ON "AssetMaintenance"("assetId", "maintenanceDate");

ALTER TABLE "TrackedAsset"
ADD CONSTRAINT "TrackedAsset_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetLocationHistory"
ADD CONSTRAINT "AssetLocationHistory_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "TrackedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetLocationHistory"
ADD CONSTRAINT "AssetLocationHistory_changedById_fkey"
FOREIGN KEY ("changedById") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetMaintenance"
ADD CONSTRAINT "AssetMaintenance_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "TrackedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetMaintenance"
ADD CONSTRAINT "AssetMaintenance_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
