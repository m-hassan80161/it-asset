import axios from "axios";

const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const API_BASE = configuredApiBase
  ? /^https?:\/\//i.test(configuredApiBase)
    ? configuredApiBase
    : `/${configuredApiBase.replace(/^\/+/, "")}`
  : "/api/v1";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});
const requestStartedAt = new WeakMap<object, number>();
api.interceptors.request.use((config) => {
  requestStartedAt.set(config, Date.now());
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.config) {
      const path = error.config.url ?? "";
      if (!path.includes("/logs/client") && !path.includes("/auth/")) {
        const statusCode = error.response?.status;
        const startedAt = requestStartedAt.get(error.config);
        const endpoint = `${(error.config.method ?? "get").toUpperCase()} ${path.split("?")[0]}`;
        void api.post("/logs/client", {
          level: statusCode && statusCode < 500 ? "WARNING" : "ERROR",
          message: statusCode ? `Frontend request failed (${statusCode})` : "Frontend request failed without a response",
          endpoint,
          ...(statusCode ? { statusCode } : {}),
          ...(startedAt ? { responseTime: Date.now() - startedAt } : {}),
          details: { statusCode: statusCode ?? null },
        }).catch((logError: unknown) => {
          console.error("Unable to submit frontend log event", logError);
        });
      }
    }
    return Promise.reject(error);
  },
);
export const apiClient = api;

export const authApi = {
  login: (username: string, password: string) =>
    api.post("/auth/login", { username, password }),
  me: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout"),
  settings: () => api.get("/auth/settings"),
  updateSettings: (settings: {
    currentPassword: string;
    username: string;
    newPassword?: string;
  }) => api.put("/auth/settings", settings),
  users: () => api.get("/auth/users"),
  createUser: (user: CreateLocalUserInput) => api.post("/auth/users", user),
  updateUser: (id: string, user: UpdateLocalUserInput) => api.patch(`/auth/users/${id}`, user),
  deleteUser: (id: string, permanentlyAfter30Days: boolean) =>
    api.delete(`/auth/users/${id}`, { data: { permanentlyAfter30Days } }),
  admins: () => api.get<ManagedAdmin[]>("/auth/admins"),
  assignAdminBranch: (adminId: string, branch: string) =>
    api.put(`/auth/admins/${adminId}/branch`, { branch }),
};

export type UserRole = "EMPLOYEE" | "ADMIN" | "MANAGER" | "SUPER_ADMIN";
export type TicketCategory = "HARDWARE" | "SOFTWARE" | "NETWORK" | "PRINTER" | "OTHER";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_USER"
  | "RESOLVED"
  | "CLOSED";

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  branch: string | null;
  managedBranches: string[];
}

export interface CreateLocalUserInput {
  username: string;
  fullName: string;
  password: string;
  role: UserRole;
  branch?: string;
  managedBranches?: string[];
}

export interface UpdateLocalUserInput {
  username?: string;
  fullName?: string;
  password?: string;
  role?: UserRole;
  branch?: string | null;
  managedBranches?: string[];
  isActive?: boolean;
}

export type RemoteSupportType = "VNC" | "ANYDESK";

export interface ManagedAdmin {
  id: string;
  username: string;
  fullName: string;
  branch: string | null;
  isActive: boolean;
}

export interface TicketComment {
  id: string;
  content: string;
  createdAt: string;
  authorUsername: string;
  authorName: string;
  author: Pick<AppUser, "id" | "username" | "fullName" | "role"> | null;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  remoteSupportType: RemoteSupportType | null;
  remoteSupportId: string | null;
  branch: string;
  requesterId: string | null;
  requesterName: string;
  requesterUsername: string;
  requester: Pick<AppUser, "id" | "username" | "fullName"> | null;
  assignedAdminId: string | null;
  assignedAdmin: Pick<AppUser, "id" | "username" | "fullName"> | null;
  assignedAdminName: string | null;
  assignedAdminUsername: string | null;
  comments: TicketComment[];
  attachments: Array<{ id: string; fileName: string; fileSize: number; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface TicketList {
  data: Ticket[];
  total: number;
}

export interface ManagerDashboardData {
  total: number;
  open: number;
  inProgress: number;
  waitingUser: number;
  resolved: number;
  closed: number;
  highPriority: number;
  urgentPriority: number;
  adminCount: number;
  averageResolutionMinutes: number | null;
  byBranch: Array<{ branch: string; total: number }>;
  admins: Array<{
    id: string;
    username: string;
    fullName: string;
    branch: string | null;
    resolvedTickets: number;
    averageResolutionMinutes: number | null;
  }>;
}

export const inventoryApi = {
  list: (skip = 0, take = 50, softwareName = "") =>
    api.get("/inventory", {
      params: { skip, take, softwareName: softwareName || undefined },
    }),
  detail: (id: string) => api.get(`/inventory/${id}`),
  remove: (id: string) => api.delete(`/inventory/${id}`),
  addComponent: (deviceId: string, component: DeviceComponentInput) =>
    api.post(`/inventory/${deviceId}/components`, component),
  updateComponent: (
    deviceId: string,
    componentId: string,
    component: DeviceComponentInput,
  ) => api.put(`/inventory/${deviceId}/components/${componentId}`, component),
  removeComponent: (deviceId: string, componentId: string) =>
    api.delete(`/inventory/${deviceId}/components/${componentId}`),
  ingest: (payload: any) => api.post("/inventory", payload),
  exportDevices: (branch?: string) =>
    api.get<ExportDevice[]>("/inventory/export", { params: branch ? { branch } : {} }),
  branchPatterns: () => api.get<BranchPattern[]>("/inventory/branch-patterns"),
  createBranchPattern: (rule: Omit<BranchPattern, "id" | "createdById" | "createdAt" | "updatedAt">) =>
    api.post<BranchPattern>("/inventory/branch-patterns", rule),
  deleteBranchPattern: (id: string) => api.delete(`/inventory/branch-patterns/${id}`),
};

export interface BranchPattern {
  id: string;
  source: "DOMAIN" | "COMPUTER_NAME";
  pattern: string;
  branch: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportDevice {
  id: string;
  computerName: string;
  domain: string | null;
  branch: string | null;
  osName: string | null;
  osVersion: string | null;
  osBuild: string | null;
  lastSeenAt: string;
  cpu: {
    model: string;
    cores: number;
    threads: number;
    clockSpeedMhz: number;
    architecture: string;
  } | null;
  motherboard: {
    manufacturer: string;
    model: string;
    serialNumber: string;
  } | null;
  ramModules: Array<{ capacityGb: number; speedMhz: number; slot: string | null }>;
  disks: Array<{ type: string; totalSpaceGb: number; freeSpaceGb: number }>;
  components: Array<{
    id: string;
    category: string;
    name: string;
    manufacturer: string | null;
    model: string | null;
    sizeInches: number | null;
    details: string | null;
  }>;
}

export interface DeviceComponentInput {
  category: string;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  sizeInches?: number | null;
  details?: string | null;
  specifications?: Record<string, string>;
}

export const adApi = {
  sync: () => api.post("/active-directory/sync"),
  listUsers: (includeExcluded = false) =>
    api.get("/active-directory/users", { params: { includeExcluded } }),
  listGroups: (includeExcluded = false) =>
    api.get("/active-directory/groups", { params: { includeExcluded } }),
  listOus: (includeExcluded = false) =>
    api.get("/active-directory/ous", { params: { includeExcluded } }),
  hierarchy: (userDn: string) =>
    api.get("/active-directory/hierarchy", { params: { userDn } }),
};

export const fileServerApi = {
  discoverDepartments: () => api.post("/file-server/discover-departments"),
  listDepartments: () => api.get("/file-server/departments"),
};

export const onboardingApi = {
  start: (dto: any) => api.post("/onboarding", dto),
  list: (skip = 0, take = 20, status?: string) =>
    api.get("/onboarding", { params: { skip, take, status } }),
  detail: (id: string) => api.get(`/onboarding/${id}`),
};