import type { User } from "@/api";

/** Admins may edit anything; otherwise only the creator may. */
export function canEdit(user: User | null, createdBy: number | null | undefined): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  return createdBy != null && createdBy === user.id;
}
