import { RemoteSupportType, TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(RemoteSupportType)
  remoteSupportType?: RemoteSupportType | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  remoteSupportId?: string | null;
}
