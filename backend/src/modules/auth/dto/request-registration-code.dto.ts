import { IsEmail, MaxLength } from "class-validator";

export class RequestRegistrationCodeDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}
