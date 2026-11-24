import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateKnowledgeArticleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  problem: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  solution: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  keywords?: string;
}
