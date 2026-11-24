import { Module } from "@nestjs/common";
import { LogsModule } from "../logs/logs.module";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";
import { KnowledgeBaseController } from "./knowledge-base.controller";
import { KnowledgeBaseService } from "./knowledge-base.service";

@Module({
  imports: [LogsModule],
  controllers: [TicketsController, KnowledgeBaseController],
  providers: [TicketsService, KnowledgeBaseService],
  exports: [TicketsService],
})
export class TicketsModule {}
