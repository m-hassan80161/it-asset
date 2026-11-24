CREATE TYPE "DeviceFormFactor" AS ENUM ('LAPTOP', 'PC', 'UNKNOWN');

ALTER TABLE "Device"
ADD COLUMN "formFactor" "DeviceFormFactor";
