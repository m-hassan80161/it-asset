import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OnboardingService } from "./onboarding.service";
import { CreateEmployeeOnboardingDto } from "./dto/create-employee-onboarding.dto";

@ApiTags("onboarding")
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post()
  startOnboarding(@Body() dto: CreateEmployeeOnboardingDto) {
    return this.onboardingService.startOnboarding(dto);
  }

  @Get()
  list(
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("status") status?: string,
  ) {
    return this.onboardingService.listOnboardingRequests({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      status: status as any,
    });
  }

  @Get(":id")
  getRequest(@Param("id") id: string) {
    return this.onboardingService.getOnboardingRequest(id);
  }
}
