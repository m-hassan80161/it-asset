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
  login: (username: string, password: string, rememberMe = false) =>
    api.post("/auth/login", { username, password, rememberMe }),
  registrationBranches: () => api.get<Array<{ name: string }>>("/auth/registration/branches"),
  requestRegistrationCode: (email: string) =>
    api.post("/auth/registration/code", { email }),
  completeRegistration: (registration: {
    email: string;
    code: string;
    fullName: string;
    password: string;
    branch: string;
    phone?: string;
  }) => api.post("/auth/registration/complete", registration),
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
  cpanelAccounts: (prefix?: string, search?: string) =>
    api.get<CpanelAccount[]>("/auth/cpanel/accounts", {
      params: {
        ...(prefix?.trim() ? { prefix: prefix.trim() } : {}),
        ...(search?.trim() ? { search: search.trim() } : {}),
      },
    }),
  addCpanelAccount: (email: string) =>
    api.post<CpanelAccount>("/auth/cpanel/accounts", { email }),
  deleteCpanelAccount: (username: string) =>
    api.delete<{ username: string }>(`/auth/cpanel/accounts/${encodeURIComponent(username)}`),
};

export interface CpanelAccount {
  username: string;
  domain: string;
  hostingAccountUsername: string | null;
  status: "ACTIVE" | "SUSPENDED" | "MISSING";
  lastSyncedAt: string;
  lastSeenAt: string;
  itamAccountId: string | null;
  itamAccount: Pick<AppUser, "id" | "username" | "fullName" | "role" | "branch"> & {
    isActive: boolean;
    authProvider: "LOCAL" | "CPANEL";
  } | null;
}

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
  phone?: string | null;
  role: UserRole;
  authProvider?: "LOCAL" | "CPANEL";
  branch: string | null;
  managedBranches: string[];
}

export interface CreateLocalUserInput {
  username: string;
  fullName: string;
  phone?: string;
  password: string;
  role: UserRole;
  branch?: string;
  managedBranches?: string[];
}

export interface UpdateLocalUserInput {
  username?: string;
  fullName?: string;
  phone?: string | null;
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
  ticketNumber: number;
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
  requesterEmail: string | null;
  requesterPhone: string | null;
  requesterLocation: string | null;
  requesterUsername: string;
  requester: Pick<AppUser, "id" | "username" | "fullName"> | null;
  assignedAdminId: string | null;
  assignedAdmin: Pick<AppUser, "id" | "username" | "fullName"> | null;
  assignedAdminName: string | null;
  assignedAdminUsername: string | null;
  comments: TicketComment[];
  transferRequests?: Array<{
    id: string;
    targetAdminId: string | null;
    targetName: string;
    createdAt: string;
  }>;
  attachments: Array<{ id: string; fileName: string; fileSize: number; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  assignedAt: string | null;
  closedAt: string | null;
  waitingUserStartedAt: string | null;
  waitingUserDurationMs: number;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  problem: string;
  solution: string;
  keywords: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    createdAt: string;
  }>;
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
  closed: number;
  highPriority: number;
  urgentPriority: number;
  adminCount: number;
  averageResolutionMinutes: number | null;
  byBranch: Array<{ branch: string; total: number }>;
  recurrentProblems: Array<{ title: string; category: string; total: number }>;
  monthlyTickets: Array<{ month: string; total: number }>;
  admins: Array<{
    id: string;
    username: string;
    fullName: string;
    branch: string | null;
    assignedTickets: number;
    resolvedTickets: number;
    averageResolutionMinutes: number | null;
  }>;
}

export const inventoryApi = {
  list: (skip = 0, take = 50, softwareName = "", computerName = "", branch = "") =>
    api.get<InventoryListResponse>("/inventory", {
      params: {
        skip,
        take,
        softwareName: softwareName || undefined,
        computerName: computerName || undefined,
        branch: branch || undefined,
      },
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
  branches: () => api.get<Array<{ name: string }>>("/inventory/branches"),
  createBranch: (name: string) => api.post<{ name: string }>("/inventory/branches", { name }),
  deleteBranch: (name: string) => api.delete(`/inventory/branches/${encodeURIComponent(name)}`),
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

export interface InventoryListItem {
  id: string;
  computerName: string;
  loggedInUser?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  formFactor?: "LAPTOP" | "PC" | "UNKNOWN" | null;
  lastSeenAt: string;
  branch?: string | null;
  software?: Array<{ id: string; name: string; version: string }>;
  installedSoftware?: Array<{ id: string; name: string; version: string }>;
}

export interface InventoryListResponse {
  data: InventoryListItem[];
  total: number;
}

export type AssetType = "PRINTER" | "SCANNER" | "PC" | "MONITOR" | "OTHER";

export interface TrackedAsset {
  id: string;
  assetCode: string;
  type: AssetType;
  modelName: string;
  serialNumber: string | null;
  manufacturerSerialNumber: string | null;
  location: string;
  branch: string | null;
  department: string | null;
  employee: AssetEmployee | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  locationHistory?: AssetLocationHistory[];
  maintenance?: AssetMaintenance[];
  photos?: AssetPhoto[];
}

export interface AssetEmployee {
  id: string;
  name: string;
  email: string | null;
}

export interface AssetLocationHistory {
  id: string;
  assetId: string;
  fromLocation: string | null;
  toLocation: string;
  fromDepartment: string | null;
  toDepartment: string | null;
  fromEmployeeName: string | null;
  fromEmployeeEmail: string | null;
  toEmployeeName: string | null;
  toEmployeeEmail: string | null;
  changedByName: string;
  changedAt: string;
}

export interface AssetMaintenance {
  id: string;
  assetId: string;
  maintenanceDate: string;
  summary: string;
  details: string | null;
  createdByName: string;
  createdAt: string;
  invoices: AssetFileMetadata[];
}

export interface AssetFileMetadata {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface AssetPhoto extends AssetFileMetadata {
  assetId: string;
  caption: string | null;
  location: string;
  department: string | null;
  employeeName: string | null;
  employeeEmail: string | null;
  uploadedByName: string;
}

export interface AssetReport {
  totalAssets: number;
  assetsWithMaintenance: number;
  assetsWithoutMaintenance: number;
  totalMaintenanceRecords: number;
  frequentMaintenanceThreshold: number;
  frequentMaintenanceAssets: Array<{
    id: string;
    assetCode: string;
    type: AssetType;
    modelName: string;
    location: string;
    branch: string | null;
    maintenanceCount: number;
    lastMaintenanceDate: string | null;
  }>;
  recurringIssues: Array<{
    summary: string;
    count: number;
    assetCount: number;
  }>;
}

export interface WindowsAgent {
  id: string;
  computerName: string;
  primaryMac: string | null;
  macAddresses: string[];
  loggedInUser: string | null;
  domain: string | null;
  osName: string | null;
  osVersion: string | null;
  agentVersion: string;
  lastSeenAt: string;
  lastInventoryAt: string | null;
  isEnabled: boolean;
  enrolledAt: string;
  online: boolean;
}

export interface WindowsAgentRelease {
  version: string | null;
  notes?: string;
  sha256?: string;
  publishedAt?: string;
}

export const assetsApi = {
  options: () =>
    api.get<{ branches: Array<{ name: string }>; employees: AssetEmployee[] }>("/assets/options"),
  list: (search = "") =>
    api.get<{ data: TrackedAsset[]; total: number }>("/assets", {
      params: search.trim() ? { search: search.trim() } : {},
    }),
  create: (asset: {
    type: AssetType;
    modelName: string;
    branch: string;
    department?: string;
    employeeId?: string;
    employeeName?: string;
    employeeEmail?: string;
  }) => api.post<TrackedAsset>("/assets", asset),
  detail: (id: string) => api.get<TrackedAsset>(`/assets/${id}`),
  updateAssignment: (id: string, assignment: {
    branch: string;
    department?: string;
    employeeId?: string;
    employeeName?: string;
    employeeEmail?: string;
  }) => api.patch<TrackedAsset>(`/assets/${id}/location`, assignment),
  addMaintenance: (
    id: string,
    maintenance: { maintenanceDate?: string; summary: string; details?: string; files?: File[] },
  ) => {
    const form = new FormData();
    if (maintenance.maintenanceDate) form.append("maintenanceDate", maintenance.maintenanceDate);
    form.append("summary", maintenance.summary);
    if (maintenance.details) form.append("details", maintenance.details);
    for (const file of maintenance.files ?? []) form.append("files", file);
    return api.post<AssetMaintenance>(`/assets/${id}/maintenance`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  addPhoto: (id: string, file: File, caption?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (caption?.trim()) form.append("caption", caption.trim());
    return api.post<AssetPhoto>(`/assets/${id}/photos`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  photo: (id: string, photoId: string) =>
    api.get<{ fileName: string; fileUrl: string; mimeType: string }>(`/assets/${id}/photos/${photoId}`),
  invoice: (id: string, maintenanceId: string, invoiceId: string) =>
    api.get<{ fileName: string; fileUrl: string; mimeType: string }>(
      `/assets/${id}/maintenance/${maintenanceId}/invoices/${invoiceId}`,
    ),
  maintenanceTimeline: (search = "") =>
    api.get<TrackedAsset[]>("/assets/maintenance", {
      params: search.trim() ? { search: search.trim() } : {},
    }),
  report: () => api.get<AssetReport>("/assets/report"),
};

export const windowsAgentApi = {
  list: () => api.get<WindowsAgent[]>("/agent-management"),
  createServerChangeCredential: (id: string) =>
    api.post<{ credential: string; expiresAt: string }>(
      `/agent-management/${id}/server-change-credentials`,
    ),
  setEnabled: (id: string, isEnabled: boolean) =>
    api.patch<{ id: string; isEnabled: boolean }>(`/agent-management/${id}/enabled`, { isEnabled }),
  latestRelease: () => api.get<WindowsAgentRelease>("/agent-management/releases/latest"),
  publishRelease: async (input: {
    packageFile: File;
    signatureFile: File;
    version: string;
    notes?: string;
  }) => {
    const form = new FormData();
    form.append("package", input.packageFile);
    form.append("version", input.version);
    form.append("notes", input.notes ?? "");
    form.append("signature", await input.signatureFile.text());
    return api.post<WindowsAgentRelease>("/agent-management/releases", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export interface ExportDevice {
  id: string;
  computerName: string;
  domain: string | null;
  branch: string | null;
  osName: string | null;
  osVersion: string | null;
  osBuild: string | null;
  formFactor: "LAPTOP" | "PC" | "UNKNOWN" | null;
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
    serialNumber: string | null;
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
