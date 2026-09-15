import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SoftwareComplianceService } from "./software-compliance.service";

@ApiTags("software-compliance")
@Controller("software-compliance")
export class SoftwareComplianceController {
  constructor(private readonly service: SoftwareComplianceService) {}

  @Get("master-list")
  getMasterList() {
    return this.service.listMasterList();
  }

  @Post("master-list")
  upsertMasterSoftware(
    @Body() body: { name: string; minRequiredVersion: string; isMandatory?: boolean },
  ) {
    return this.service.upsertMasterSoftware(
      body.name,
      body.minRequiredVersion,
      body.isMandatory,
    );
  }

  @Get("alerts")
  getAlerts() {
    return this.service.listOpenAlerts();
  }
}
