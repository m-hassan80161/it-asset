import { Module } from "@nestjs/common";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { ActiveDirectoryModule } from "../active-directory/ad.module";
//import { FileServerModule } from "../file-server/file-server.module";

@Module({
  imports: [ActiveDirectoryModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
