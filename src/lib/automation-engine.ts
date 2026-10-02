import { AutomationSeverity, AutomationTrigger } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const negative = new Set(["ISSUE","TRANSFER_OUT","ADJUSTMENT_OUT","SALE","WASTE"]);

async function recentDuplicate(tenantId: string, ruleId: string, entityType: string, entityId: string) {
  return db.notification.findFirst({
    where: {
      tenantId,
      ruleId,
      entityType,
      entityId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });
}

export async function runTenantAutomationRules(tenantId: string) {
  const rules = await db.automationRule.findMany({ where: { tenantId, active: true } });
  let created = 0;

  for (const rule of rules) {
    if (rule.trigger === AutomationTrigger.LOW_STOCK) {
      const [products, txns] = await Promise.all([
        db.product.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, unit: true, reorderLevel: true } }),
        db.inventoryTransaction.findMany({ where: { tenantId }, select: { productId: true, type: true, quantity: true } }),
      ]);
      const totals = new Map<string, number>();
      for (const txn of txns) {
        const q = Number(txn.quantity);
        totals.set(txn.productId, (totals.get(txn.productId) || 0) + (negative.has(txn.type) ? -q : q));
      }
      for (const product of products) {
        const threshold = rule.threshold != null ? Number(rule.threshold) : product.reorderLevel != null ? Number(product.reorderLevel) : undefined;
        if (threshold == null) continue;
        const onHand = totals.get(product.id) || 0;
        if (onHand <= threshold && !(await recentDuplicate(tenantId, rule.id, "Product", product.id))) {
          await db.notification.create({
            data: {
              tenantId,
              ruleId: rule.id,
              severity: rule.severity,
              title: "Low stock: " + product.name,
              body: String(onHand) + " " + product.unit + " on hand; threshold is " + String(threshold) + ".",
              entityType: "Product",
              entityId: product.id,
            },
          });
          created++;
        }
      }
    }

    if (rule.trigger === AutomationTrigger.TASK_OVERDUE) {
      const tasks = await db.task.findMany({
        where: { tenantId, dueAt: { lt: new Date() }, status: { in: ["TODO","IN_PROGRESS","BLOCKED"] } },
        select: { id: true, title: true },
      });
      for (const task of tasks) {
        if (!(await recentDuplicate(tenantId, rule.id, "Task", task.id))) {
          await db.notification.create({
            data: {
              tenantId,
              ruleId: rule.id,
              severity: rule.severity,
              title: "Overdue task: " + task.title,
              body: "This work item is past its due date and remains open.",
              entityType: "Task",
              entityId: task.id,
            },
          });
          created++;
        }
      }
    }

    if (rule.trigger === AutomationTrigger.SCOUTING_HIGH) {
      const observations = await db.scoutingObservation.findMany({
        where: { tenantId, resolvedAt: null, severity: { in: ["HIGH","CRITICAL"] } },
        select: { id: true, issue: true, severity: true },
      });
      for (const observation of observations) {
        if (!(await recentDuplicate(tenantId, rule.id, "ScoutingObservation", observation.id))) {
          await db.notification.create({
            data: {
              tenantId,
              ruleId: rule.id,
              severity: observation.severity === "CRITICAL" ? AutomationSeverity.CRITICAL : rule.severity,
              title: observation.issue,
              body: observation.severity.toLowerCase() + " scouting exception requires attention.",
              entityType: "ScoutingObservation",
              entityId: observation.id,
            },
          });
          created++;
        }
      }
    }

    if (rule.trigger === AutomationTrigger.EQUIPMENT_SERVICE_DUE) {
      const equipment = await db.equipment.findMany({
        where: { tenantId, meterReading: { not: null }, nextServiceAt: { not: null } },
        select: { id: true, name: true, meterReading: true, nextServiceAt: true, meterUnit: true },
      });
      for (const asset of equipment) {
        if (Number(asset.meterReading) >= Number(asset.nextServiceAt) && !(await recentDuplicate(tenantId, rule.id, "Equipment", asset.id))) {
          await db.notification.create({
            data: {
              tenantId,
              ruleId: rule.id,
              severity: rule.severity,
              title: "Service due: " + asset.name,
              body: "Current meter " + String(asset.meterReading) + " " + (asset.meterUnit || "") + "; service threshold " + String(asset.nextServiceAt) + ".",
              entityType: "Equipment",
              entityId: asset.id,
            },
          });
          created++;
        }
      }
    }
  }

  return { rules: rules.length, notificationsCreated: created };
}
