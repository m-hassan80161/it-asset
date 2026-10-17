export class TicketEntity {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  branch: string;
  requesterId: string;
  assignedAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}
