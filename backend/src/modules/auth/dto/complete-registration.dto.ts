import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CompleteRegistrationDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password: string;

  @IsString()
  @MaxLength(120)
  branch: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+0-9().\-\s]{7,32}$/)
  phone?: string;
}
