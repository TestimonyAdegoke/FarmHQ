import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

/** Loads the active tenant context; when a permission is given, users without it are sent back to the dashboard. */
export async function tenantContext(permission?: Permission) {
  const { session, membership } = await requireSession();
  if (permission && !can(membership.role, permission)) redirect(`/dashboard?denied=${encodeURIComponent(permission)}`);
  return {
    tenantId: session.tenantId,
    userId: session.userId,
    role: membership.role,
    user: membership.user,
    tenant: membership.tenant,
    farmScope: membership.farmScope,
    can: (p: Permission) => can(membership.role, p),
  };
}
