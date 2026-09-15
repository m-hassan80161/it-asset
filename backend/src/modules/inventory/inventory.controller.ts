import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { InventoryService } from "./inventory.service";
import { InventoryPayloadDto } from "./dto/inventory-payload.dto";

@ApiTags("inventory")
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Called by the PowerShell GPO collector script (Invoke-RestMethod)
  @Post()
  ingest(@Body() payload: InventoryPayloadDto) {
    return this.inventoryService.ingest(payload);
  }

  @Get()
  list(@Query("skip") skip?: string, @Query("take") take?: string) {
    return this.inventoryService.listDevices({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.inventoryService.getDeviceDetail(id);
  }
}
