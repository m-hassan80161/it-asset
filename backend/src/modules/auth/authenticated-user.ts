import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  branch: string | null;
  managedBranches: string[];
}
