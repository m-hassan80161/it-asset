import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
