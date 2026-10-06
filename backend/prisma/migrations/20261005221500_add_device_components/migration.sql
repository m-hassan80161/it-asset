CREATE TYPE "DeviceComponentAction" AS ENUM ('ADDED', 'UPDATED', 'REMOVED');

CREATE TABLE "DeviceComponent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "sizeInches" DOUBLE PRECISION,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeviceComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceComponentHistory" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "componentId" TEXT,
    "componentName" TEXT NOT NULL,
    "action" "DeviceComponentAction" NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceComponentHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceComponent_deviceId_idx" ON "DeviceComponent"("deviceId");
CREATE INDEX "DeviceComponentHistory_deviceId_changedAt_idx" ON "DeviceComponentHistory"("deviceId", "changedAt");
CREATE INDEX "DeviceComponentHistory_componentId_idx" ON "DeviceComponentHistory"("componentId");

ALTER TABLE "DeviceComponent"
ADD CONSTRAINT "DeviceComponent_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceComponentHistory"
ADD CONSTRAINT "DeviceComponentHistory_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceComponentHistory"
ADD CONSTRAINT "DeviceComponentHistory_componentId_fkey"
FOREIGN KEY ("componentId") REFERENCES "DeviceComponent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
