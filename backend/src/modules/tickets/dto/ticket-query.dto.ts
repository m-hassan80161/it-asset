import { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from "class-validator";

enum TicketSortField {
  CREATED_AT = "createdAt",
  PRIORITY = "priority",
}

export class TicketQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value)
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @IsEnum(TicketSortField)
  sortBy: TicketSortField = TicketSortField.CREATED_AT;

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder: "asc" | "desc" = "desc";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take = 25;
}
