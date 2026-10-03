import { NextResponse } from "next/server";
import { z } from "zod";
import { ActivityStatus, OfflineMutationStatus, OfflineMutationType, ObservationSeverity, TaskStatus, type Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const mutationSchema = z.object({
  clientMutationId: z.string().min(8).max(120),
  deviceFingerprint: z.string().max(160).optional(),
  type: z.nativeEnum(OfflineMutationType),
  payload: z.record(z.string(), z.unknown()),
});

const bodySchema = z.object({
  mutations: z.array(mutationSchema).min(1).max(50),
});

const scoutingSchema = z.object({
  farmId: z.string().min(1),
  unitId: z.string().optional(),
  cycleId: z.string().optional(),
  observedAt: z.string().datetime().optional(),
  category: z.string().min(1).max(100),
  issue: z.string().min(2).max(500),
  severity: z.nativeEnum(ObservationSeverity).default(ObservationSeverity.MEDIUM),
  affectedAreaHa: z.number().nonnegative().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  recommendation: z.string().max(1000).optional(),
});

const taskStatusSchema = z.object({
  taskId: z.string().min(1),
  status: z.nativeEnum(TaskStatus),
});

const activityStatusSchema = z.object({
  activityId: z.string().min(1),
  status: z.nativeEnum(ActivityStatus),
});

async function processMutation(tenantId: string, mutation: z.infer<typeof mutationSchema>) {
  if (mutation.type === OfflineMutationType.SCOUTING_OBSERVATION) {
    const payload = scoutingSchema.parse(mutation.payload);
    const [farm, unit, cycle] = await Promise.all([
      db.farm.findFirst({ where: { id: payload.farmId, tenantId }, select: { id: true } }),
      payload.unitId ? db.productionUnit.findFirst({ where: { id: payload.unitId, tenantId, farmId: payload.farmId }, select: { id: true } }) : Promise.resolve(null),
      payload.cycleId ? db.productionCycle.findFirst({ where: { id: payload.cycleId, tenantId, farmId: payload.farmId }, select: { id: true } }) : Promise.resolve(null),
    ]);
    if (!farm || (payload.unitId && !unit) || (payload.cycleId && !cycle)) throw new Error("Invalid farm, production unit or cycle");
    await db.scoutingObservation.create({
      data: {
        tenantId,
        farmId: payload.farmId,
        unitId: payload.unitId,
        cycleId: payload.cycleId,
        observedAt: payload.observedAt ? new Date(payload.observedAt) : new Date(),
        category: payload.category,
        issue: payload.issue,
        severity: payload.severity,
        affectedAreaHa: payload.affectedAreaHa,
        latitude: payload.latitude,
        longitude: payload.longitude,
        recommendation: payload.recommendation,
      },
    });
    return;
  }

  if (mutation.type === OfflineMutationType.TASK_STATUS) {
    const payload = taskStatusSchema.parse(mutation.payload);
    const task = await db.task.findFirst({ where: { id: payload.taskId, tenantId }, select: { id: true } });
    if (!task) throw new Error("Task not found");
    await db.task.update({
      where: { id: task.id },
      data: {
        status: payload.status,
        completedAt: payload.status === TaskStatus.DONE ? new Date() : null,
      },
    });
    return;
  }

  if (mutation.type === OfflineMutationType.CROP_ACTIVITY_STATUS) {
    const payload = activityStatusSchema.parse(mutation.payload);
    const activity = await db.cropActivity.findFirst({ where: { id: payload.activityId, tenantId }, select: { id: true } });
    if (!activity) throw new Error("Crop activity not found");
    await db.cropActivity.update({
      where: { id: activity.id },
      data: {
        status: payload.status,
        completedAt: payload.status === ActivityStatus.COMPLETED ? new Date() : null,
      },
    });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  const membership = await db.membership.findUnique({ where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } }, select: { id: true } });
  if (!membership) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const parsed = bodySchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ ok:false, error:"Invalid sync payload", details:parsed.error.flatten() }, { status:400 });

  const fingerprints = [...new Set(parsed.data.mutations.map(m=>m.deviceFingerprint).filter((value): value is string => Boolean(value)))];
  const platform = request.headers.get("x-farmhq-platform")?.slice(0,80) || undefined;
  const appVersion = request.headers.get("x-farmhq-app-version")?.slice(0,40) || undefined;
  for (const fingerprint of fingerprints) {
    await db.offlineDevice.upsert({
      where: { tenantId_fingerprint: { tenantId: session.tenantId, fingerprint } },
      create: {
        tenantId: session.tenantId,
        userId: session.userId,
        fingerprint,
        platform,
        appVersion,
        lastSeenAt: new Date(),
      },
      update: {
        userId: session.userId,
        platform,
        appVersion,
        active: true,
        lastSeenAt: new Date(),
      },
    });
  }

  const results: Array<{ clientMutationId:string; status:OfflineMutationStatus; error?:string }> = [];

  for (const mutation of parsed.data.mutations) {
    const existing = await db.offlineMutation.findUnique({
      where: { tenantId_clientMutationId: { tenantId: session.tenantId, clientMutationId: mutation.clientMutationId } },
    });
    if (existing) {
      results.push({ clientMutationId: mutation.clientMutationId, status: existing.status, error: existing.error || undefined });
      continue;
    }

    const record = await db.offlineMutation.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        clientMutationId: mutation.clientMutationId,
        deviceFingerprint: mutation.deviceFingerprint,
        type: mutation.type,
        payload: mutation.payload as Prisma.InputJsonValue,
      },
    });

    try {
      await processMutation(session.tenantId, mutation);
      await db.offlineMutation.update({ where: { id: record.id }, data: { status: OfflineMutationStatus.PROCESSED, processedAt: new Date() } });
      results.push({ clientMutationId: mutation.clientMutationId, status: OfflineMutationStatus.PROCESSED });
    } catch (caught) {
      const error = caught instanceof Error ? caught.message.slice(0, 500) : "Sync failed";
      await db.offlineMutation.update({ where: { id: record.id }, data: { status: OfflineMutationStatus.FAILED, error } });
      results.push({ clientMutationId: mutation.clientMutationId, status: OfflineMutationStatus.FAILED, error });
    }
  }

  if (fingerprints.length) {
    await db.offlineDevice.updateMany({
      where: { tenantId: session.tenantId, fingerprint: { in: fingerprints } },
      data: { lastSyncAt: new Date(), lastSeenAt: new Date() },
    });
  }

  return NextResponse.json({ ok:true, results });
}
