import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { LogsModule } from "../logs/logs.module";
import { CpanelService } from "./cpanel.service";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [LogsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CpanelService,
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AuthModule {}
