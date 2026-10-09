import {
  apiClient,
  ManagerDashboardData,
  RemoteSupportType,
  Ticket,
  TicketCategory,
  TicketList,
  TicketPriority,
  TicketStatus,
} from "./api";

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  branch?: string;
  from?: string;
  to?: string;
  sortBy?: "createdAt" | "priority";
  sortOrder?: "asc" | "desc";
  skip?: number;
  take?: number;
}

export const ticketsApi = {
  list: (filters: TicketFilters = {}) => apiClient.get<TicketList>("/tickets", { params: filters }),
  branch: (branch: string, filters: TicketFilters = {}) =>
    apiClient.get<TicketList>(`/tickets/admin/branch/${encodeURIComponent(branch)}`, { params: filters }),
  managerList: (filters: TicketFilters = {}) =>
    apiClient.get<TicketList>("/tickets/manager/tickets", { params: filters }),
  create: (input: {
    title: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
    branch?: string;
    remoteSupportType?: RemoteSupportType;
    remoteSupportId?: string;
  }) => apiClient.post<Ticket>("/tickets", input),
  update: (
    id: string,
    input: {
      title?: string;
      description?: string;
      category?: TicketCategory;
      status?: TicketStatus;
      priority?: TicketPriority;
      remoteSupportType?: RemoteSupportType | null;
      remoteSupportId?: string | null;
    },
  ) => apiClient.patch<Ticket>(`/tickets/${id}`, input),
  close: (id: string) => apiClient.post<Ticket>(`/tickets/${id}/close`),
  comment: (id: string, content: string) =>
    apiClient.post(`/tickets/${id}/comment`, { content }),
  assign: (id: string, assignedAdminId: string) =>
    apiClient.patch<Ticket>(`/tickets/${id}/assign`, { assignedAdminId }),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post(`/tickets/${id}/attachments`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getAttachment: (ticketId: string, attachmentId: string) =>
    apiClient.get<{ fileName: string; fileUrl: string }>(
      `/tickets/${ticketId}/attachments/${attachmentId}`,
    ),
  adminDashboard: () => apiClient.get<{
    branch: string | null;
    open: number;
    inProgress: number;
    waitingUser: number;
    high: number;
    urgent: number;
  }>("/tickets/admin/dashboard"),
  managerDashboard: () => apiClient.get<ManagerDashboardData>("/tickets/manager/dashboard"),
  transferTargets: () => apiClient.get<Array<{
    id: string;
    username: string;
    fullName: string;
    branch: string | null;
  }>>("/tickets/admin/transfer-targets"),
  transferInbox: () => apiClient.get<Array<{
    id: string;
    requesterName: string;
    requesterUsername: string;
    message: string | null;
    createdAt: string;
    ticket: Pick<Ticket, "id" | "title" | "branch" | "status" | "priority">;
  }>>("/tickets/admin/transfers/inbox"),
  requestTransfer: (ticketId: string, targetAdminId: string, message?: string) =>
    apiClient.post(`/tickets/${ticketId}/transfer-requests`, { targetAdminId, message }),
  respondToTransfer: (requestId: string, approve: boolean) =>
    apiClient.post(`/tickets/transfer-requests/${requestId}/${approve ? "approve" : "reject"}`),
  managerStats: () => apiClient.get("/tickets/manager/stats"),
};
