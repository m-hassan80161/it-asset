import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { WindowsAgentController } from "./windows-agent.controller";
import { WindowsAgentManagementController } from "./windows-agent-management.controller";
import { WindowsAgentGuard } from "./windows-agent.guard";
import { WindowsAgentService } from "./windows-agent.service";

@Module({
  imports: [InventoryModule],
  controllers: [WindowsAgentController, WindowsAgentManagementController],
  providers: [WindowsAgentGuard, WindowsAgentService],
})
export class WindowsAgentModule {}
