import { IsOptional, IsString, MaxLength } from "class-validator";

export class KnowledgeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
