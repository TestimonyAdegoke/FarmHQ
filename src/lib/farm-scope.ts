import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fail } from "@/lib/forms";
import { can, type Permission } from "@/lib/permissions";

/**
 * Farm IDs a membership is limited to (`Membership.farmScope`). An empty list means organisation-wide access.
 *
 * Rules for a scoped member:
 * - They only see records whose farm is in scope: a `farmId` column, or the farm of the linked cycle, warehouse,
 *   animal, worker, invoice, purchase order, device or trace lot.
 * - Organisation-wide records (`farmId` null) are hidden from them, and they cannot create new ones.
 * - Shared catalogues (products, customers, suppliers, money-account names) stay visible so forms keep working.
 * - Organisation-level administration (team, settings, automations, cash & bank, payroll) is unscoped-only.
 */
export type FarmScope = readonly string[];

export type ScopedMember = { role: Role; farmScope: FarmScope };

type FarmIn = { in: string[] };

export function isScoped(scope: FarmScope) {
  return scope.length > 0;
}

/** `where` fragment for models with a `farmId` column. Rows with no farm are excluded for scoped members. */
export function farmWhere(scope: FarmScope): { farmId?: FarmIn } {
  return isScoped(scope) ? { farmId: { in: [...scope] } } : {};
}

/** `where` fragment for the Farm model itself. */
export function farmIdWhere(scope: FarmScope): { id?: FarmIn } {
  return isScoped(scope) ? { id: { in: [...scope] } } : {};
}

/** `where` fragment for models that reach a farm through a relation, e.g. `relatedFarmWhere(scope, "cycle")`. */
export function relatedFarmWhere<K extends string>(scope: FarmScope, relation: K): { [P in K]?: { farmId: FarmIn } } {
  return (isScoped(scope) ? { [relation]: { farmId: { in: [...scope] } } } : {}) as { [P in K]?: { farmId: FarmIn } };
}

/** `warehouseId` filter for models that store a warehouse without a Prisma relation (stock counts). */
export async function warehouseIdWhere(tenantId: string, scope: FarmScope): Promise<{ warehouseId?: FarmIn }> {
  if (!isScoped(scope)) return {};
  const rows = await db.warehouse.findMany({ where: { tenantId, ...farmWhere(scope) }, select: { id: true } });
  return { warehouseId: { in: rows.map(r => r.id) } };
}

/** `complianceRecordId` filter for compliance actions, which have no Prisma relation to their record. */
export async function complianceRecordIdWhere(tenantId: string, scope: FarmScope): Promise<{ complianceRecordId?: FarmIn }> {
  if (!isScoped(scope)) return {};
  const rows = await db.complianceRecord.findMany({ where: { tenantId, ...farmWhere(scope) }, select: { id: true } });
  return { complianceRecordId: { in: rows.map(r => r.id) } };
}

export function canAccessFarm(scope: FarmScope, farmId: string | null | undefined) {
  return !isScoped(scope) || (farmId != null && scope.includes(farmId));
}

/** Rejects a write that targets a farm (or an organisation-wide record) outside the member's scope. */
export function assertFarmAccess(scope: FarmScope, farmId: string | null | undefined) {
  if (!canAccessFarm(scope, farmId)) fail(farmId ? "You do not have access to that farm." : "Only members with access to all farms can work with organisation-wide records.");
}

/** Rejects organisation-level work (money accounts, payroll, new farms…) by a farm-scoped member. */
export function assertOrganisationWide(scope: FarmScope, what = "this") {
  if (isScoped(scope)) fail(`Only members with access to all farms can do ${what}.`);
}

/**
 * Farm for a new record whose farm field is optional. Scoped members cannot create organisation-wide records,
 * so a blank choice falls back to their only farm, or is rejected when they have several.
 */
export function resolveFarmId(scope: FarmScope, farmId: string | null | undefined): string | undefined {
  if (farmId) {
    assertFarmAccess(scope, farmId);
    return farmId;
  }
  if (!isScoped(scope)) return undefined;
  if (scope.length === 1) return scope[0];
  fail("Select one of your farms for this record.");
}

/** Permissions that act on the whole organisation and are never granted to farm-scoped members. */
const ORGANISATION_PERMISSIONS: Permission[] = ["tenant.manage", "team.manage"];

/** Role permission check that also withholds organisation-level permissions from farm-scoped members. */
export function memberCan(member: ScopedMember, permission: Permission) {
  return can(member.role, permission) && !(isScoped(member.farmScope) && ORGANISATION_PERMISSIONS.includes(permission));
}
