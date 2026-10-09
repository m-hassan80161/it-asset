import { BranchPatternSource } from "@prisma/client";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

export class BranchPatternDto {
  @IsEnum(BranchPatternSource)
  source: BranchPatternSource;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  pattern: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  branch: string;
}
