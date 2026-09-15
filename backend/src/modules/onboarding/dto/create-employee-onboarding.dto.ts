import { IsEmail, IsString, IsOptional } from "class-validator";

export class CreateEmployeeOnboardingDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsString() username: string;
  @IsEmail() email: string;
  @IsString() password: string;
  @IsString() targetOuDn: string; // e.g. "OU=Users,DC=corp,DC=local"
  @IsOptional() @IsString() managerDn?: string;
  @IsOptional() @IsString() departmentFolderId?: string;
  @IsString({ each: true }) requestedGroupDns: string[]; // array of group DNs
}
