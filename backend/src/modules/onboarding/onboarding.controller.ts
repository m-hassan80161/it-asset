import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { OnboardingService } from "./onboarding.service";
import { CreateEmployeeOnboardingDto } from "./dto/create-employee-onboarding.dto";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";

@ApiTags("onboarding")
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
