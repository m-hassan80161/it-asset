import { AssetType } from "@prisma/client";
import { IsEnum, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateAssetDto {
  @IsEnum(AssetType)
  type: AssetType;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  modelName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  branch: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  employeeEmail?: string;
}
