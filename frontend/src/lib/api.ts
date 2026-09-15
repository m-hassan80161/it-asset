import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

export const inventoryApi = {
  list: (skip = 0, take = 50) =>
    api.get("/inventory", { params: { skip, take } }),
  detail: (id: string) => api.get(`/inventory/${id}`),
  ingest: (payload: any) => api.post("/inventory", payload),
};

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

export const complianceApi = {
  masterList: () => api.get("/software-compliance/master-list"),
  upsertMaster: (name: string, minRequiredVersion: string, isMandatory = false) =>
    api.post("/software-compliance/master-list", {
      name,
      minRequiredVersion,
      isMandatory,
    }),
  alerts: () => api.get("/software-compliance/alerts"),
};

export const onboardingApi = {
  start: (dto: any) => api.post("/onboarding", dto),
  list: (skip = 0, take = 20, status?: string) =>
    api.get("/onboarding", { params: { skip, take, status } }),
  detail: (id: string) => api.get(`/onboarding/${id}`),
};
