import "server-only";

import { requireSession } from "@/lib/auth";

export async function tenantContext() {
  const { session, membership } = await requireSession();
  return {
    tenantId: session.tenantId,
    userId: session.userId,
    role: membership.role,
    user: membership.user,
    tenant: membership.tenant,
    farmScope: membership.farmScope,
  };
}
