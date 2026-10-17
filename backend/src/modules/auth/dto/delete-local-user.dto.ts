import { IsBoolean } from "class-validator";

export class DeleteLocalUserDto {
  @IsBoolean()
  permanentlyAfter30Days: boolean;
}
