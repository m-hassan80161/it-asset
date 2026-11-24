DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'DeviceFormFactor'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "DeviceFormFactor" AS ENUM ('LAPTOP', 'PC', 'UNKNOWN');
  END IF;
END
$$;

ALTER TYPE "DeviceFormFactor" ADD VALUE IF NOT EXISTS 'LAPTOP';
ALTER TYPE "DeviceFormFactor" ADD VALUE IF NOT EXISTS 'PC';
ALTER TYPE "DeviceFormFactor" ADD VALUE IF NOT EXISTS 'UNKNOWN';

ALTER TABLE "Device"
ADD COLUMN IF NOT EXISTS "formFactor" "DeviceFormFactor";
