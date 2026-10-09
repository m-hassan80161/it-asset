import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateAdminBranchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  branch: string;
}
