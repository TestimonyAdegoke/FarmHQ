import { Role } from "@/generated/prisma/client";

export type Permission =
  | "tenant.manage"
  | "team.manage"
  | "farm.view"
  | "farm.manage"
  | "production.view"
  | "production.manage"
  | "task.manage"
  | "inventory.view"
  | "inventory.manage"
  | "finance.view"
  | "finance.manage"
  | "livestock.view"
  | "livestock.manage"
  | "equipment.view"
  | "equipment.manage"
  | "procurement.view"
  | "procurement.manage"
  | "sales.view"
  | "sales.manage"
  | "workforce.view"
  | "workforce.manage"
  | "workforce.attendance"
  | "analytics.view";

const all: Permission[] = [
  "tenant.manage","team.manage","farm.view","farm.manage","production.view","production.manage",
  "task.manage","inventory.view","inventory.manage","finance.view","finance.manage",
  "livestock.view","livestock.manage","equipment.view","equipment.manage",
  "procurement.view","procurement.manage","sales.view","sales.manage",
  "workforce.view","workforce.manage","workforce.attendance","analytics.view",
];

const matrix: Record<Role, Permission[]> = {
  OWNER: all,
  ORG_ADMIN: all,
  FARM_MANAGER: ["farm.view","farm.manage","production.view","production.manage","task.manage","inventory.view","inventory.manage","finance.view","livestock.view","livestock.manage","equipment.view","equipment.manage","procurement.view","procurement.manage","sales.view","sales.manage","workforce.view","workforce.manage","workforce.attendance","analytics.view"],
  OPERATIONS_MANAGER: ["farm.view","farm.manage","production.view","production.manage","task.manage","inventory.view","inventory.manage","finance.view","livestock.view","livestock.manage","equipment.view","equipment.manage","procurement.view","procurement.manage","sales.view","sales.manage","workforce.view","workforce.manage","workforce.attendance","analytics.view"],
  AGRONOMIST: ["farm.view","production.view","production.manage","task.manage","inventory.view","analytics.view"],
  LIVESTOCK_MANAGER: ["farm.view","task.manage","inventory.view","livestock.view","livestock.manage","analytics.view"],
  ACCOUNTANT: ["farm.view","inventory.view","finance.view","finance.manage","procurement.view","sales.view","workforce.view","analytics.view"],
  PROCUREMENT_OFFICER: ["farm.view","inventory.view","inventory.manage","finance.view","procurement.view","procurement.manage","sales.view"],
  STOREKEEPER: ["farm.view","inventory.view","inventory.manage"],
  SALES_OFFICER: ["farm.view","inventory.view","finance.view","sales.view","sales.manage","analytics.view"],
  FIELD_SUPERVISOR: ["farm.view","production.view","task.manage","inventory.view","livestock.view","equipment.view","workforce.view","workforce.attendance"],
  FIELD_WORKER: ["farm.view","production.view","task.manage","inventory.view","livestock.view","equipment.view"],
  AUDITOR: ["farm.view","production.view","inventory.view","finance.view","livestock.view","equipment.view","procurement.view","sales.view","workforce.view","analytics.view"],
  VIEWER: ["farm.view","production.view","inventory.view","finance.view","livestock.view","equipment.view","procurement.view","sales.view","workforce.view","analytics.view"],
};

export function can(role: Role, permission: Permission) {
  return matrix[role].includes(permission);
}
