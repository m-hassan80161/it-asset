import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { LogLevel, LogSource, Prisma, PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    this.$use(async (params, next) => {
      if (params.model === "ApplicationLog") return next(params);
      const startedAt = Date.now();
      try {
        const result = await next(params);
        const duration = Date.now() - startedAt;
        if (duration > 1000) {
          await this.recordDatabaseEvent({
            level: LogLevel.WARNING,
            message: "Slow database operation",
            model: params.model,
            action: params.action,
            duration,
          });
        }
        return result;
      } catch (error) {
        const duration = Date.now() - startedAt;
        await this.recordDatabaseEvent({
          level: LogLevel.ERROR,
          message: "Database operation failed",
          model: params.model,
          action: params.action,
          duration,
          stackTrace: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async recordDatabaseEvent(event: {
    level: LogLevel;
    message: string;
    model?: string;
    action: string;
    duration: number;
    stackTrace?: string;
  }) {
    try {
      await this.applicationLog.create({
        data: {
          level: event.level,
          source: LogSource.DATABASE,
          message: event.message,
          stackTrace: event.stackTrace,
          duration: event.duration,
          responseTime: event.duration,
          details: {
            model: event.model ?? "raw",
            action: event.action,
            duration: event.duration,
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Unable to persist database performance event: ${reason}`);
    }
  }
}
