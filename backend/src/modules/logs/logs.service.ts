import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { LogLevel, LogSource, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/authenticated-user";
import { LogQueryDto } from "./dto/log-query.dto";
import { ClientLogDto } from "./dto/client-log.dto";

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  log(level: LogLevel, message: string, details?: Prisma.InputJsonValue) {
    return this.write({ level, source: LogSource.BACKEND, message, details });
  }

  info(message: string, details?: Prisma.InputJsonValue) {
    return this.log(LogLevel.INFO, message, details);
  }

  warning(message: string, details?: Prisma.InputJsonValue) {
    return this.log(LogLevel.WARNING, message, details);
  }

  error(
    message: string,
    stackTrace?: string,
    details?: Prisma.InputJsonValue,
  ) {
    return this.write({
      level: LogLevel.ERROR,
      source: LogSource.BACKEND,
      message,
      stackTrace,
      details,
    });
  }

  audit(userId: string, message: string, details: Prisma.InputJsonObject) {
    return this.write({
      level: LogLevel.INFO,
      source: LogSource.BACKEND,
      userId,
      message,
      details,
    });
  }

  clientEvent(userId: string, event: ClientLogDto) {
    return this.write({
      level: event.level,
      source: LogSource.FRONTEND,
      userId,
      message: event.message,
      endpoint: event.endpoint,
      responseTime: event.responseTime,
      duration: event.responseTime,
      statusCode: event.statusCode,
      details: event.details as Prisma.InputJsonValue | undefined,
    });
  }

  logPerformance(
    endpoint: string,
    duration: number,
    statusCode: number,
    userId?: string,
  ) {
    return this.write({
      level: statusCode >= 500 ? LogLevel.ERROR : LogLevel.INFO,
      source: LogSource.API,
      message: `${statusCode >= 500 ? "Request failed" : "Request completed"}: ${endpoint}`,
      endpoint,
      statusCode,
      duration,
      responseTime: duration,
      userId,
      details: { statusCode, duration },
    });
  }

  logRequestError(
    endpoint: string,
    duration: number,
    statusCode: number,
    message: string,
    stackTrace?: string,
    userId?: string,
  ) {
    return this.write({
      level: LogLevel.ERROR,
      source: LogSource.API,
      message,
      endpoint,
      statusCode,
      duration,
      responseTime: duration,
      stackTrace,
      userId,
      details: { endpoint, statusCode, duration },
    });
  }

  async safeRecord(record: Promise<unknown>) {
    try {
      await record;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Unable to persist application log: ${reason}`);
    }
  }

  async list(actor: AuthenticatedUser, query: LogQueryDto) {
    const where = await this.buildWhere(actor, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.applicationLog.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { timestamp: "desc" },
      }),
      this.prisma.applicationLog.count({ where }),
    ]);
    return { data, total, skip: query.skip, take: query.take };
  }

  async analytics(actor: AuthenticatedUser) {
    this.assertCanViewLogs(actor);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const baseWhere = await this.buildWhere(actor, {
      skip: 0,
      take: 100,
      from: since.toISOString(),
    });
    const apiWhere: Prisma.ApplicationLogWhereInput = {
      AND: [baseWhere, { source: LogSource.API }],
    };
    const [errors24h, apiCount, apiErrors, recent] = await Promise.all([
      this.prisma.applicationLog.count({
        where: { AND: [baseWhere, { level: LogLevel.ERROR }] },
      }),
      this.prisma.applicationLog.count({ where: apiWhere }),
      this.prisma.applicationLog.count({
        where: { AND: [apiWhere, { level: LogLevel.ERROR }] },
      }),
      this.prisma.applicationLog.findMany({
        where: baseWhere,
        take: 5000,
        orderBy: { timestamp: "desc" },
        select: {
          level: true,
          source: true,
          endpoint: true,
          responseTime: true,
          timestamp: true,
        },
      }),
    ]);
    const endpoints = new Map<
      string,
      { count: number; errors: number; responseTotal: number; responseCount: number }
    >();
    const hours = new Map<string, { count: number; responseTotal: number; responseCount: number }>();
    const allResponseTimes: number[] = [];
    const databaseTimes: number[] = [];
    let databaseErrors = 0;
    for (const log of recent) {
      if (log.source === LogSource.DATABASE) {
        if (log.responseTime !== null) databaseTimes.push(log.responseTime);
        if (log.level === LogLevel.ERROR) databaseErrors += 1;
      }
      if (log.source !== LogSource.API) continue;
      const endpoint = log.endpoint ?? "Unknown endpoint";
      const stats = endpoints.get(endpoint) ?? {
        count: 0,
        errors: 0,
        responseTotal: 0,
        responseCount: 0,
      };
      stats.count += 1;
      if (log.level === LogLevel.ERROR) stats.errors += 1;
      if (log.responseTime !== null) {
        stats.responseTotal += log.responseTime;
        stats.responseCount += 1;
        allResponseTimes.push(log.responseTime);
      }
      endpoints.set(endpoint, stats);

      const hour = new Date(log.timestamp);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();
      const trend = hours.get(key) ?? { count: 0, responseTotal: 0, responseCount: 0 };
      trend.count += 1;
      if (log.responseTime !== null) {
        trend.responseTotal += log.responseTime;
        trend.responseCount += 1;
      }
      hours.set(key, trend);
    }
    const endpointRows = [...endpoints.entries()].map(([endpoint, stats]) => ({
      endpoint,
      requestCount: stats.count,
      errorCount: stats.errors,
      errorRate: stats.count ? Math.round((stats.errors / stats.count) * 10000) / 100 : 0,
      averageResponseTime: stats.responseCount
        ? Math.round(stats.responseTotal / stats.responseCount)
        : null,
    }));
    return {
      errors24h,
      requestCount24h: apiCount,
      errorRate24h: apiCount ? Math.round((apiErrors / apiCount) * 10000) / 100 : 0,
      averageApiResponseTime: allResponseTimes.length
        ? Math.round(allResponseTimes.reduce((sum, value) => sum + value, 0) / allResponseTimes.length)
        : null,
      databasePerformance: {
        slowOperations: databaseTimes.filter((duration) => duration > 1000).length,
        errors24h: databaseErrors,
        averageOperationTime: databaseTimes.length
          ? Math.round(databaseTimes.reduce((sum, value) => sum + value, 0) / databaseTimes.length)
          : null,
      },
      slowEndpoints: endpointRows
        .filter((row) => row.averageResponseTime !== null && row.averageResponseTime > 1000)
        .sort((a, b) => (b.averageResponseTime ?? 0) - (a.averageResponseTime ?? 0)),
      errorRateByEndpoint: endpointRows.sort((a, b) => b.errorRate - a.errorRate),
      responseTimeTrend: [...hours.entries()]
        .map(([timestamp, stats]) => ({
          timestamp,
          requests: stats.count,
          averageResponseTime: stats.responseCount
            ? Math.round(stats.responseTotal / stats.responseCount)
            : null,
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      sampleSize: recent.length,
    };
  }

  private async buildWhere(
    actor: AuthenticatedUser,
    query: LogQueryDto,
  ): Promise<Prisma.ApplicationLogWhereInput> {
    this.assertCanViewLogs(actor);
    const where: Prisma.ApplicationLogWhereInput = {
      ...(query.level ? { level: query.level } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            timestamp: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.endpoint ? { endpoint: { contains: query.endpoint, mode: "insensitive" } } : {}),
      ...(query.search
        ? {
            OR: [
              { message: { contains: query.search, mode: "insensitive" } },
              { endpoint: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    if (actor.role === UserRole.MANAGER) {
      const users = await this.prisma.adminAccount.findMany({
        where: {
          OR: [
            { id: actor.id },
            { role: UserRole.ADMIN, branch: { in: actor.managedBranches } },
            { role: UserRole.EMPLOYEE, branch: { in: actor.managedBranches } },
          ],
        },
        select: { id: true },
      });
      const existingAnd = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];
      delete where.userId;
      where.AND = [
        ...existingAnd,
        ...(query.userId ? [{ userId: query.userId }] : []),
        {
          OR: [
            { userId: { in: users.map(({ id }) => id) } },
            ...(query.userId ? [] : [{ source: LogSource.DATABASE }]),
          ],
        },
      ];
    }
    return where;
  }

  private assertCanViewLogs(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.MANAGER) {
      throw new ForbiddenException("Manager access required");
    }
  }

  private write(
    data: Prisma.ApplicationLogCreateInput,
  ) {
    return this.prisma.applicationLog.create({ data });
  }
}
