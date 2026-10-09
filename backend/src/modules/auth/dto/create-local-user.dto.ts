import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { UserRole } from "@prisma/client";

export class CreateLocalUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._@-]+$/)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  managedBranches?: string[];
}
