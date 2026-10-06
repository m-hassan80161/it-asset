import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword: string;

  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._@-]+$/)
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword?: string;
}
