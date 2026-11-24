import { IsArray, IsMACAddress, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Prisma } from "@prisma/client";

export class EnrollAgentDto {
  @IsUUID()
  installId: string;

  @IsString()
  @MaxLength(200)
  computerName: string;

  @IsString()
  @MaxLength(100)
  agentVersion: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  loggedInUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  osName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  osVersion?: string;

  @IsArray()
  @IsMACAddress(undefined, { each: true })
  macAddresses: string[];

  @IsOptional()
  @IsObject()
  snapshot?: Prisma.InputJsonObject;
}
