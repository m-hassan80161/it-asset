import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { InventoryService } from "./inventory.service";
import { DeviceComponentDto } from "./dto/device-component.dto";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { BranchPatternDto } from "./dto/branch-pattern.dto";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags("inventory")
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Called by the PowerShell GPO collector script (Invoke-RestMethod)
  @Public()
  @Post()
  ingest(@Body() payload: InventoryPayloadDto) {
    return this.inventoryService.ingest(payload);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("softwareName") softwareName?: string,
  ) {
    return this.inventoryService.listDevices({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      softwareName,
      role: request.user?.role,
      actorBranch: request.user?.branch,
    });
  }

  @Get("export")
  exportDevices(
    @Req() request: AuthenticatedRequest,
    @Query("branch") branch?: string,
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.inventoryService.exportDevices(branch, request.user.role, request.user.branch);
  }

  @Get("branch-patterns")
  @Roles(UserRole.SUPER_ADMIN)
  listBranchPatterns() {
    return this.inventoryService.listBranchPatterns();
  }

  @Post("branch-patterns")
  @Roles(UserRole.SUPER_ADMIN)
  createBranchPattern(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BranchPatternDto,
  ) {
    if (!request.user) throw new BadRequestException("Authentication required");
    return this.inventoryService.createBranchPattern(request.user.id, dto);
  }

  @Delete("branch-patterns/:id")
  @Roles(UserRole.SUPER_ADMIN)
  deleteBranchPattern(@Param("id") id: string) {
    return this.inventoryService.deleteBranchPattern(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.inventoryService.deleteDevice(id);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.inventoryService.getDeviceDetail(id);
  }

  @Post(":id/components")
  addComponent(
    @Param("id") id: string,
    @Body() dto: DeviceComponentDto,
  ) {
    return this.inventoryService.addDeviceComponent(id, dto);
  }

  @Put(":id/components/:componentId")
  updateComponent(
    @Param("id") id: string,
    @Param("componentId") componentId: string,
    @Body() dto: DeviceComponentDto,
  ) {
    return this.inventoryService.updateDeviceComponent(id, componentId, dto);
  }

  @Delete(":id/components/:componentId")
  removeComponent(
    @Param("id") id: string,
    @Param("componentId") componentId: string,
  ) {
    return this.inventoryService.removeDeviceComponent(id, componentId);
  }
}
