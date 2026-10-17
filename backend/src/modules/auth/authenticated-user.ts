import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  branch: string | null;
  managedBranches: string[];
}
