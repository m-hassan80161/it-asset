import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { UserRole } from "@prisma/client";

export class UpdateLocalUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._@-]+$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+0-9().\-\s]{7,32}$/)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  managedBranches?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
