import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { farmIdWhere, farmWhere, isScoped, memberCan, relatedFarmWhere } from "@/lib/farm-scope";
import type { Permission } from "@/lib/permissions";

/**
 * Loads the active tenant context; when a permission is given, users without it are sent back to the dashboard.
 * `organisationWide` pages (whole-organisation money, payroll, administration) are also closed to farm-scoped members.
 */
export async function tenantContext(permission?: Permission, options: { organisationWide?: boolean } = {}) {
  const { session, membership } = await requireSession();
  if (permission && !memberCan(membership, permission)) redirect(`/dashboard?denied=${encodeURIComponent(permission)}`);
  if (options.organisationWide && isScoped(membership.farmScope)) redirect("/dashboard?denied=organisation");
  const farmScope = membership.farmScope;
  return {
    tenantId: session.tenantId,
    userId: session.userId,
    role: membership.role,
    user: membership.user,
    tenant: membership.tenant,
    farmScope,
    can: (p: Permission) => memberCan(membership, p),
    /** Prisma `where` fragments that limit queries to the member's farms (all empty for organisation-wide members). */
    scope: {
      limited: isScoped(farmScope),
      /** Models with a `farmId` column. */
      byFarm: farmWhere(farmScope),
      /** The Farm model itself. */
      farms: farmIdWhere(farmScope),
      /** Models linked to a farm through a relation, e.g. `via("cycle")`. */
      via: <K extends string>(relation: K) => relatedFarmWhere(farmScope, relation),
    },
  };
}
