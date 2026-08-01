import type { Role } from "@/lib/auth";

// Roles an admin can assign through the UI (LP is reserved for the fund portal).
export const ASSIGNABLE_ROLES: Role[] = [
  "owner",
  "admin",
  "manager",
  "staff",
  "viewer",
];
