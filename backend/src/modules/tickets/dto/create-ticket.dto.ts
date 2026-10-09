import { RemoteSupportType, TicketCategory, TicketPriority } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  description: string;

  @IsEnum(TicketCategory)
  category: TicketCategory;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  departmentId?: string;

  @IsOptional()
  @IsEnum(RemoteSupportType)
  remoteSupportType?: RemoteSupportType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  remoteSupportId?: string;
}
