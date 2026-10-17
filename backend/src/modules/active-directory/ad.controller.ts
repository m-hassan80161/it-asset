import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { ActiveDirectoryService } from "./ad.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";

@ApiTags("active-directory")
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("active-directory")
export class ActiveDirectoryController {
  constructor(private readonly adService: ActiveDirectoryService) {}

  @Post("sync")
  sync() {
    return this.adService.fullSync();
  }

  @Get("users")
  listUsers(@Query("includeExcluded") includeExcluded?: string) {
    return this.adService.listUsers(includeExcluded === "true");
  }

  @Get("groups")
  listGroups(@Query("includeExcluded") includeExcluded?: string) {
    return this.adService.listGroups(includeExcluded === "true");
  }

  @Get("ous")
  listOus(@Query("includeExcluded") includeExcluded?: string) {
    return this.adService.listOus(includeExcluded === "true");
  }

  @Get("hierarchy")
  hierarchy(@Query("userDn") userDn: string) {
    return this.adService.getOrgHierarchy(userDn);
  }
}
