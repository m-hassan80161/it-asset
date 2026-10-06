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
};

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
};

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