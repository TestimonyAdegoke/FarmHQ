import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { Prisma, Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const COOKIE = "farmhq_session";
const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "development-only-change-this-secret-now");

export type Session = {
  userId: string;
  tenantId: string;
  role: Role;
};

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: String(payload.userId),
      tenantId: String(payload.tenantId),
      role: String(payload.role) as Role,
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");

  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
    include: { user: true, tenant: true },
  });
  if (!membership) {
    await clearSession();
    redirect("/login");
  }
  return { session: { ...session, role: membership.role }, membership };
}

export async function audit(action: string, entityType: string, entityId?: string, metadata?: Prisma.InputJsonValue) {
  const session = await getSession();
  if (!session) return;
  await db.auditLog.create({
    data: { tenantId: session.tenantId, userId: session.userId, action, entityType, entityId, metadata },
  });
}
