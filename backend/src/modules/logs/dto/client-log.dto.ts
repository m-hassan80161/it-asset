import { LogLevel } from "@prisma/client";
import { IsEnum, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ClientLogDto {
  @IsEnum(LogLevel)
  level: LogLevel;

  @IsString()
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  endpoint?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600000)
  responseTime?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;
}
