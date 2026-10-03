import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { AutomationSeverity, NotificationDeliveryStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const severityRank: Record<AutomationSeverity, number> = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
};

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part)=>!Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export function validateWebhookUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Local webhook targets are not allowed");
  if (isIP(host) === 4 && isPrivateIpv4(host)) throw new Error("Private-network webhook targets are not allowed");
  if (isIP(host) === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))) throw new Error("Private-network webhook targets are not allowed");
  return url.toString();
}

export async function runNotificationDeliveries(tenantId: string) {
  const endpoints = await db.notificationEndpoint.findMany({ where: { tenantId, active: true } });
  if (!endpoints.length) return { endpoints: 0, attempted: 0, sent: 0, failed: 0 };

  const notifications = await db.notification.findMany({
    where: { tenantId, createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "asc" },
    take: 250,
  });

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (const endpoint of endpoints) {
    for (const notification of notifications) {
      if (severityRank[notification.severity] < severityRank[endpoint.minimumSeverity]) continue;
      const existing = await db.notificationDelivery.findUnique({
        where: { notificationId_endpointId: { notificationId: notification.id, endpointId: endpoint.id } },
      });
      if (existing?.status === NotificationDeliveryStatus.SENT) continue;

      const delivery = existing || await db.notificationDelivery.create({
        data: {
          tenantId,
          notificationId: notification.id,
          endpointId: endpoint.id,
        },
      });

      const payload = JSON.stringify({
        event: "farmhq.notification",
        tenantId,
        notification: {
          id: notification.id,
          severity: notification.severity,
          title: notification.title,
          body: notification.body,
          entityType: notification.entityType,
          entityId: notification.entityId,
          createdAt: notification.createdAt.toISOString(),
        },
      });
      const headers: Record<string,string> = {
        "content-type": "application/json",
        "user-agent": "FarmHQ-Webhook/0.4",
        "x-farmhq-event": "notification",
      };
      const secret = process.env.NOTIFICATION_WEBHOOK_SECRET;
      if (secret) headers["x-farmhq-signature"] = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");

      attempted++;
      try {
        const response = await fetch(endpoint.url, {
          method: "POST",
          headers,
          body: payload,
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Webhook responded with HTTP " + String(response.status));
        await db.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.SENT,
            attempts: { increment: 1 },
            responseCode: response.status,
            error: null,
            lastAttemptAt: new Date(),
            deliveredAt: new Date(),
          },
        });
        sent++;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message.slice(0,500) : "Webhook delivery failed";
        await db.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.FAILED,
            attempts: { increment: 1 },
            error: message,
            lastAttemptAt: new Date(),
          },
        });
        failed++;
      }
    }
  }

  return { endpoints: endpoints.length, attempted, sent, failed };
}
