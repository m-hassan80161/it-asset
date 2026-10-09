import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RequestTransferDto {
  @IsString()
  @MinLength(1)
  targetAdminId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
