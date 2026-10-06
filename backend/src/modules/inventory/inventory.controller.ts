import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { InventoryService } from "./inventory.service";
import { DeviceComponentDto } from "./dto/device-component.dto";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";
import { Public } from "../auth/public.decorator";

@ApiTags("inventory")
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
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("softwareName") softwareName?: string,
  ) {
    return this.inventoryService.listDevices({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      softwareName,
    });
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
