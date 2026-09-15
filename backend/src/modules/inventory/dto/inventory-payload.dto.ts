import { Type } from "class-transformer";
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class CpuDto {
  @IsString() model: string;
  @IsNumber() cores: number;
  @IsNumber() threads: number;
  @IsNumber() clockSpeedMhz: number;
  @IsString() architecture: string;
}

export class MotherboardDto {
  @IsString() manufacturer: string;
  @IsString() model: string;
  @IsString() serialNumber: string;
}

export class RamModuleDto {
  @IsNumber() capacityGb: number;
  @IsNumber() speedMhz: number;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() slot?: string;
}

export class DiskDriveDto {
  @IsString() type: "SSD" | "HDD" | "NVME" | "UNKNOWN";
  @IsOptional() @IsString() serialNumber?: string;
  @IsNumber() totalSpaceGb: number;
  @IsNumber() freeSpaceGb: number;
}

export class InstalledSoftwareDto {
  @IsString() name: string;
  @IsString() version: string;
  @IsOptional() @IsString() publisher?: string;
  @IsOptional() @IsString() installDate?: string;
}

export class GitConfigDto {
  @IsOptional() @IsString() userName?: string;
  @IsOptional() @IsString() userEmail?: string;
  @IsOptional() @IsString() gitVersion?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sshPublicKeys?: string[];
}

export class InventoryPayloadDto {
  @IsString() computerName: string;
  @IsOptional() @IsString() loggedInUser?: string;
  @IsOptional() @IsString() osName?: string;
  @IsOptional() @IsString() osVersion?: string;
  @IsOptional() @IsString() osBuild?: string;
  @IsOptional() @IsString() domain?: string;

  @ValidateNested() @Type(() => CpuDto) cpu: CpuDto;
  @ValidateNested() @Type(() => MotherboardDto) motherboard: MotherboardDto;

  @IsArray() @ValidateNested({ each: true }) @Type(() => RamModuleDto)
  ramModules: RamModuleDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => DiskDriveDto)
  disks: DiskDriveDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => InstalledSoftwareDto)
  software: InstalledSoftwareDto[];

  @IsOptional() @ValidateNested() @Type(() => GitConfigDto)
  gitConfig?: GitConfigDto;
}
