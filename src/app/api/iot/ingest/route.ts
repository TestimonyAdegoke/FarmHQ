import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  readings: z.array(z.object({
    metric: z.string().min(1).max(80),
    value: z.number().finite(),
    unit: z.string().min(1).max(30),
    recordedAt: z.string().datetime().optional(),
    metadata: z.unknown().optional(),
  })).min(1).max(100),
});

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function POST(request: Request) {
  const deviceId = request.headers.get("x-farmhq-device-id") || "";
  const token = request.headers.get("x-farmhq-token") || "";
  if (!deviceId || !token) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const device = await db.iotDevice.findUnique({ where: { id: deviceId } });
  if (!device || !device.active) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const actual = hash(token);
  const expected = Buffer.from(device.apiKeyHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const parsed = bodySchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ ok:false, error:"Invalid payload", details:parsed.error.flatten() }, { status:400 });

  await db.$transaction([
    db.sensorReading.createMany({
      data: parsed.data.readings.map(reading => ({
        tenantId: device.tenantId,
        deviceId: device.id,
        metric: reading.metric,
        value: reading.value,
        unit: reading.unit,
        recordedAt: reading.recordedAt ? new Date(reading.recordedAt) : new Date(),
        metadata: reading.metadata as Prisma.InputJsonValue | undefined,
      })),
    }),
    db.iotDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }),
  ]);

  return NextResponse.json({ ok:true, accepted:parsed.data.readings.length });
}
