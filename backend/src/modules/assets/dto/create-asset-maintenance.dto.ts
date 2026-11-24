import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateAssetMaintenanceDto {
  @IsOptional()
  @IsDateString()
  maintenanceDate?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  summary: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  details?: string;
}
