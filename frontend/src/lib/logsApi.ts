import { apiClient } from "./api";

export interface LogEntry {
  id: string;
  userId: string | null;
  level: "INFO" | "WARNING" | "ERROR" | "DEBUG";
  source: "FRONTEND" | "BACKEND" | "DATABASE" | "API";
  message: string;
  endpoint: string | null;
  responseTime: number | null;
  statusCode: number | null;
  timestamp: string;
  stackTrace: string | null;
}

export interface LogFilters {
  level?: LogEntry["level"];
  source?: LogEntry["source"];
  from?: string;
  to?: string;
  userId?: string;
  endpoint?: string;
  search?: string;
  skip?: number;
  take?: number;
}

export interface LogAnalytics {
  errors24h: number;
  requestCount24h: number;
  errorRate24h: number;
  averageApiResponseTime: number | null;
  databasePerformance: {
    slowOperations: number;
    errors24h: number;
    averageOperationTime: number | null;
  };
  sampleSize: number;
  slowEndpoints: Array<{
    endpoint: string;
    requestCount: number;
    errorCount: number;
    errorRate: number;
    averageResponseTime: number | null;
  }>;
  errorRateByEndpoint: Array<{
    endpoint: string;
    requestCount: number;
    errorCount: number;
    errorRate: number;
    averageResponseTime: number | null;
  }>;
  responseTimeTrend: Array<{
    timestamp: string;
    requests: number;
    averageResponseTime: number | null;
  }>;
}

export const logsApi = {
  list: (filters: LogFilters = {}) =>
    apiClient.get<{ data: LogEntry[]; total: number }>("/logs", { params: filters }),
  analytics: () => apiClient.get<LogAnalytics>("/logs/analytics"),
};
