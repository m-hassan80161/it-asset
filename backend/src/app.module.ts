import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { AuthModule } from "./modules/auth/auth.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { LogsModule } from "./modules/logs/logs.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { WindowsAgentModule } from "./modules/windows-agent/windows-agent.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    InventoryModule,
    TicketsModule,
    AssetsModule,
    WindowsAgentModule,
    LogsModule,
  ],
})
export class AppModule {}
