import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { LogsModule } from "../logs/logs.module";
import { CpanelArchiveService } from "./cpanel-archive.service";
import { EmailVerificationService } from "./email-verification.service";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [LogsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    CpanelArchiveService,
    EmailVerificationService,
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AuthModule {}
