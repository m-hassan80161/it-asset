import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { LogsController } from "./logs.controller";
import { LoggingInterceptor } from "./logger.interceptor";
import { LogsService } from "./logs.service";

@Module({
  controllers: [LogsController],
  providers: [
    LogsService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
  exports: [LogsService],
})
export class LogsModule {}
