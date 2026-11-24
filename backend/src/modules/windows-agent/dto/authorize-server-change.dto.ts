import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class AuthorizeServerChangeDto {
  @IsUUID()
  installId: string;

  @IsString()
  @MinLength(32)
  @MaxLength(100)
  credential: string;
}
