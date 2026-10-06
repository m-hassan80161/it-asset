DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'DeviceComponentAction'
    ) THEN
        CREATE TYPE "DeviceComponentAction" AS ENUM ('ADDED', 'UPDATED', 'REMOVED');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "DeviceComponent" (
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

CREATE TABLE IF NOT EXISTS "DeviceComponentHistory" (
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

CREATE INDEX IF NOT EXISTS "DeviceComponent_deviceId_idx" ON "DeviceComponent"("deviceId");
CREATE INDEX IF NOT EXISTS "DeviceComponentHistory_deviceId_changedAt_idx" ON "DeviceComponentHistory"("deviceId", "changedAt");
CREATE INDEX IF NOT EXISTS "DeviceComponentHistory_componentId_idx" ON "DeviceComponentHistory"("componentId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DeviceComponent_deviceId_fkey'
          AND conrelid = '"DeviceComponent"'::regclass
    ) THEN
        ALTER TABLE "DeviceComponent"
        ADD CONSTRAINT "DeviceComponent_deviceId_fkey"
        FOREIGN KEY ("deviceId") REFERENCES "Device"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DeviceComponentHistory_deviceId_fkey'
          AND conrelid = '"DeviceComponentHistory"'::regclass
    ) THEN
        ALTER TABLE "DeviceComponentHistory"
        ADD CONSTRAINT "DeviceComponentHistory_deviceId_fkey"
        FOREIGN KEY ("deviceId") REFERENCES "Device"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DeviceComponentHistory_componentId_fkey'
          AND conrelid = '"DeviceComponentHistory"'::regclass
    ) THEN
        ALTER TABLE "DeviceComponentHistory"
        ADD CONSTRAINT "DeviceComponentHistory_componentId_fkey"
        FOREIGN KEY ("componentId") REFERENCES "DeviceComponent"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
