-- CreateEnum
CREATE TYPE "DiskType" AS ENUM ('SSD', 'HDD', 'NVME', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('UP_TO_DATE', 'OUTDATED', 'MISSING', 'NOT_TRACKED');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('PENDING', 'AD_USER_CREATED', 'AD_GROUPS_ASSIGNED', 'FOLDER_CREATED', 'NTFS_PERMISSIONS_SET', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "computerName" TEXT NOT NULL,
    "loggedInUser" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "osBuild" TEXT,
    "domain" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CpuInfo" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "cores" INTEGER NOT NULL,
    "threads" INTEGER NOT NULL,
    "clockSpeedMhz" INTEGER NOT NULL,
    "architecture" TEXT NOT NULL,

    CONSTRAINT "CpuInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotherboardInfo" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,

    CONSTRAINT "MotherboardInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RamModule" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capacityGb" DOUBLE PRECISION NOT NULL,
    "speedMhz" INTEGER NOT NULL,
    "serialNumber" TEXT,
    "slot" TEXT,

    CONSTRAINT "RamModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiskDrive" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "DiskType" NOT NULL DEFAULT 'UNKNOWN',
    "serialNumber" TEXT,
    "totalSpaceGb" DOUBLE PRECISION NOT NULL,
    "freeSpaceGb" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DiskDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledSoftware" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "publisher" TEXT,
    "installDate" TIMESTAMP(3),
    "masterSoftwareId" TEXT,
    "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'NOT_TRACKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledSoftware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterSoftware" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minRequiredVersion" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterSoftware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAlert" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "softwareName" TEXT NOT NULL,
    "newVersion" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "laggingCount" INTEGER NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitConfig" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userName" TEXT,
    "userEmail" TEXT,
    "gitVersion" TEXT,
    "sshPublicKeys" TEXT[],

    CONSTRAINT "GitConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdOrganizationalUnit" (
    "id" TEXT NOT NULL,
    "distinguishedName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentDn" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdOrganizationalUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdGroup" (
    "id" TEXT NOT NULL,
    "distinguishedName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdUser" (
    "id" TEXT NOT NULL,
    "distinguishedName" TEXT NOT NULL,
    "sAMAccountName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "managerDn" TEXT,
    "ouId" TEXT,
    "isServiceAccount" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdUserGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "AdUserGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSyncExclusionRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSyncExclusionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uncPath" TEXT NOT NULL,
    "lastScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingRequest" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "targetOuDn" TEXT NOT NULL,
    "managerDn" TEXT,
    "departmentFolderId" TEXT,
    "requestedGroups" TEXT[],
    "status" "OnboardingStep" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAdUserId" TEXT,
    "createdFolderPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingLog" (
    "id" TEXT NOT NULL,
    "onboardingRequestId" TEXT NOT NULL,
    "step" "OnboardingStep" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_computerName_key" ON "Device"("computerName");

-- CreateIndex
CREATE INDEX "Device_computerName_idx" ON "Device"("computerName");

-- CreateIndex
CREATE UNIQUE INDEX "CpuInfo_deviceId_key" ON "CpuInfo"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MotherboardInfo_deviceId_key" ON "MotherboardInfo"("deviceId");

-- CreateIndex
CREATE INDEX "RamModule_deviceId_idx" ON "RamModule"("deviceId");

-- CreateIndex
CREATE INDEX "DiskDrive_deviceId_idx" ON "DiskDrive"("deviceId");

-- CreateIndex
CREATE INDEX "InstalledSoftware_deviceId_idx" ON "InstalledSoftware"("deviceId");

-- CreateIndex
CREATE INDEX "InstalledSoftware_name_idx" ON "InstalledSoftware"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MasterSoftware_name_key" ON "MasterSoftware"("name");

-- CreateIndex
CREATE INDEX "ComplianceAlert_deviceId_idx" ON "ComplianceAlert"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "GitConfig_deviceId_key" ON "GitConfig"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "AdOrganizationalUnit_distinguishedName_key" ON "AdOrganizationalUnit"("distinguishedName");

-- CreateIndex
CREATE UNIQUE INDEX "AdGroup_distinguishedName_key" ON "AdGroup"("distinguishedName");

-- CreateIndex
CREATE UNIQUE INDEX "AdUser_distinguishedName_key" ON "AdUser"("distinguishedName");

-- CreateIndex
CREATE UNIQUE INDEX "AdUser_sAMAccountName_key" ON "AdUser"("sAMAccountName");

-- CreateIndex
CREATE UNIQUE INDEX "AdUserGroup_userId_groupId_key" ON "AdUserGroup"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentFolder_name_key" ON "DepartmentFolder"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentFolder_uncPath_key" ON "DepartmentFolder"("uncPath");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingRequest_username_key" ON "OnboardingRequest"("username");

-- CreateIndex
CREATE INDEX "OnboardingLog_onboardingRequestId_idx" ON "OnboardingLog"("onboardingRequestId");

-- AddForeignKey
ALTER TABLE "CpuInfo" ADD CONSTRAINT "CpuInfo_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotherboardInfo" ADD CONSTRAINT "MotherboardInfo_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RamModule" ADD CONSTRAINT "RamModule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiskDrive" ADD CONSTRAINT "DiskDrive_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSoftware" ADD CONSTRAINT "InstalledSoftware_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSoftware" ADD CONSTRAINT "InstalledSoftware_masterSoftwareId_fkey" FOREIGN KEY ("masterSoftwareId") REFERENCES "MasterSoftware"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAlert" ADD CONSTRAINT "ComplianceAlert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitConfig" ADD CONSTRAINT "GitConfig_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdUser" ADD CONSTRAINT "AdUser_managerDn_fkey" FOREIGN KEY ("managerDn") REFERENCES "AdUser"("distinguishedName") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdUser" ADD CONSTRAINT "AdUser_ouId_fkey" FOREIGN KEY ("ouId") REFERENCES "AdOrganizationalUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdUserGroup" ADD CONSTRAINT "AdUserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdUserGroup" ADD CONSTRAINT "AdUserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AdGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_departmentFolderId_fkey" FOREIGN KEY ("departmentFolderId") REFERENCES "DepartmentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_createdAdUserId_fkey" FOREIGN KEY ("createdAdUserId") REFERENCES "AdUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingLog" ADD CONSTRAINT "OnboardingLog_onboardingRequestId_fkey" FOREIGN KEY ("onboardingRequestId") REFERENCES "OnboardingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

