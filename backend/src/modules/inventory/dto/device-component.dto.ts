import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class DeviceComponentDto {
  @IsString()
  @MaxLength(80)
  category: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sizeInches?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;

  @IsOptional()
  @IsObject()
  specifications?: Record<string, string>;
}
