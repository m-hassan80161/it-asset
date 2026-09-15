import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ActiveDirectoryModule } from "./modules/active-directory/ad.module";
//import { FileServerModule } from "./modules/file-server/file-server.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { SoftwareComplianceModule } from "./modules/software-compliance/software-compliance.module";
import { PrismaModule } from "./common/prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    InventoryModule,
    ActiveDirectoryModule,
   // FileServerModule,
    SoftwareComplianceModule,
    OnboardingModule, // depends on AD + FileServer + SoftwareCompliance
  ],
})
export class AppModule {}
