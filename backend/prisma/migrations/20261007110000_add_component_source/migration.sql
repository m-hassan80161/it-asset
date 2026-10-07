CREATE TYPE "DeviceComponentSource" AS ENUM ('INVENTORY', 'MANUAL');

ALTER TABLE "DeviceComponent"
ADD COLUMN "source" "DeviceComponentSource" NOT NULL DEFAULT 'MANUAL';
