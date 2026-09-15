import { Module } from "@nestjs/common";
import { SoftwareComplianceController } from "./software-compliance.controller";
import { SoftwareComplianceService } from "./software-compliance.service";

@Module({
  controllers: [SoftwareComplianceController],
  providers: [SoftwareComplianceService],
  exports: [SoftwareComplianceService],
})
export class SoftwareComplianceModule {}
