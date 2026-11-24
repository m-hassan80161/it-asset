import { IsEmail, MaxLength } from "class-validator";

export class CreateCpanelAccountDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}
