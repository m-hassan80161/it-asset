import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { catchError, from, mergeMap, Observable, throwError } from "rxjs";
import { LogsService } from "./logs.service";

interface LogRequest extends Request {
  user?: { id: string };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logsService: LogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<LogRequest>();
    const response = http.getResponse<Response>();
    const routePath = `${request.baseUrl ?? ""}${request.route?.path ?? request.path}`;
    if (routePath.includes("/logs")) return next.handle();
    const startedAt = Date.now();
    const endpoint = this.getEndpoint(request);

    return next.handle().pipe(
      mergeMap((value) =>
        from(
          this.logsService.safeRecord(
            this.logsService.logPerformance(
              endpoint,
              Date.now() - startedAt,
              response.statusCode,
              request.user?.id,
            ),
          ),
        ).pipe(mergeMap(() => [value])),
      ),
      catchError((error: unknown) => {
        const duration = Date.now() - startedAt;
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "getStatus" in error &&
          typeof error.getStatus === "function"
            ? error.getStatus()
            : 500;
        const message = error instanceof Error ? error.message : "Unhandled request error";
        const stackTrace = error instanceof Error ? error.stack : undefined;
        return from(
          this.logsService.safeRecord(
            this.logsService.logRequestError(
              endpoint,
              duration,
              statusCode,
              message,
              stackTrace,
              request.user?.id,
            ),
          ),
        ).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }

  private getEndpoint(request: Request) {
    const route = request.route?.path;
    const baseUrl = request.baseUrl ?? "";
    return `${request.method} ${baseUrl}${route ?? request.path}`;
  }
}
