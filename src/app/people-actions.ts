"use server";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PayBasis, PaymentMethod, PayRunStatus, Role, TimesheetStatus } from "@/generated/prisma/client";
import { audit, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { attempt, dateValue, fail, numberValue, optional, text } from "@/lib/forms";
import { attendanceCost, STANDARD_DAY_HOURS } from "@/lib/labour";
import { labourCost, nextDocumentNumber } from "@/lib/ledger";
import { appOrigin } from "@/lib/origin";
import { can, type Permission } from "@/lib/permissions";
import { normalizePhone } from "@/lib/utils";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function context(...permissions: Permission[]) {
  const { session, membership } = await requireSession();
  if (!permissions.some(p => can(membership.role, p))) fail("Your role does not allow this action.");
  return { tenantId: session.tenantId, userId: session.userId, role: membership.role };
}

// ── Workers ─────────────────────────────────────────────────────────────────

export async function updateWorkerAction(form: FormData) {
  return attempt(async () => {
    const { tenantId } = await context("workforce.manage");
    const id = text(form, "id");
    if (!(await db.workforceMember.findFirst({ where: { id, tenantId }, select: { id: true } }))) fail("Worker not found");
    await db.workforceMember.update({
      where: { id },
      data: {
        name: z.string().min(2).parse(text(form, "name")),
        phone: optional(form, "phone") || null,
        jobTitle: optional(form, "jobTitle") || null,
        payBasis: z.nativeEnum(PayBasis).parse(text(form, "payBasis")),
        defaultHourlyRate: numberValue(form, "defaultHourlyRate") ?? null,
        dailyRate: numberValue(form, "dailyRate") ?? null,
        monthlySalary: numberValue(form, "monthlySalary") ?? null,
        pieceRate: numberValue(form, "pieceRate") ?? null,
        pieceUnit: optional(form, "pieceUnit") || null,
        paymentMethod: optional(form, "paymentMethod") ? z.nativeEnum(PaymentMethod).parse(text(form, "paymentMethod")) : null,
        paymentAccount: optional(form, "paymentAccount") || null,
        active: text(form, "active") !== "false",
      },
    });
    await audit("workforce.member.update", "WorkforceMember", id);
    revalidatePath("/workforce");
    revalidatePath(`/workforce/${id}`);
    return "Worker updated";
  });
}

/**
 * Daily muster: one submission records attendance for many workers. Each present worker becomes a timesheet costed
 * by their pay basis (hourly, daily or piece-rate). Supervisors' entries await approval; managers' are approved.
 */
export async function recordAttendanceAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, role } = await context("workforce.manage", "workforce.attendance");
    const workDate = dateValue(form, "workDate") || new Date();
    const farmId = optional(form, "farmId");
    const cycleId = optional(form, "cycleId");
    const activity = z.string().min(2, "Enter the work done").parse(text(form, "activity"));
    if (farmId && !(await db.farm.findFirst({ where: { id: farmId, tenantId }, select: { id: true } }))) fail("Farm not found");
    if (cycleId && !(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId }, select: { id: true } }))) fail("Production cycle not found");
    const presentIds = form.getAll("present").map(String);
    if (!presentIds.length) fail("Tick at least one worker who was present");
    const workers = await db.workforceMember.findMany({ where: { tenantId, id: { in: presentIds }, active: true } });
    const status = can(role, "workforce.manage") ? TimesheetStatus.APPROVED : TimesheetStatus.SUBMITTED;
    const dayStart = new Date(workDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const existing = new Set((await db.timesheet.findMany({ where: { tenantId, workerId: { in: presentIds }, workDate: { gte: dayStart, lt: dayEnd }, activity }, select: { workerId: true } })).map(t => t.workerId));
    let created = 0;
    await db.$transaction(async tx => {
      for (const w of workers) {
        if (existing.has(w.id)) continue;
        const hours = numberValue(form, `hours_${w.id}`) ?? STANDARD_DAY_HOURS;
        if (hours <= 0 || hours > 24) fail(`Hours for ${w.name} must be between 0 and 24`);
        const pieces = numberValue(form, `pieces_${w.id}`);
        const { hourlyRate, amount } = attendanceCost(w, hours, pieces);
        await tx.timesheet.create({ data: { tenantId, workerId: w.id, farmId: farmId || w.farmId, cycleId, workDate, hours, hourlyRate, amount, pieceQuantity: pieces, activity, status, notes: optional(form, "notes") } });
        created++;
      }
    });
    await audit("workforce.attendance", "Timesheet", undefined, { date: workDate.toISOString(), workers: created, activity });
    revalidatePath("/workforce");
    revalidatePath("/profitability");
    const skipped = workers.length - created;
    return `Attendance saved for ${created} worker${created === 1 ? "" : "s"}${skipped ? ` (${skipped} already recorded for this work today)` : ""}${status === "SUBMITTED" ? " · awaiting manager approval" : ""}`;
  });
}

export async function bulkApproveTimesheetsAction(form: FormData) {
  return attempt(async () => {
    const { tenantId } = await context("workforce.manage");
    const ids = form.getAll("id").map(String);
    const status = z.enum(["APPROVED", "REJECTED"]).parse(text(form, "status") || "APPROVED");
    const where = ids.length ? { tenantId, id: { in: ids }, status: TimesheetStatus.SUBMITTED } : { tenantId, status: TimesheetStatus.SUBMITTED };
    const result = await db.timesheet.updateMany({ where, data: { status } });
    await audit("timesheet.bulk_status", "Timesheet", undefined, { status, count: result.count });
    revalidatePath("/workforce");
    revalidatePath("/profitability");
    return `${result.count} timesheet${result.count === 1 ? "" : "s"} ${status.toLowerCase()}`;
  });
}

export async function createAdvanceAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId } = await context("workforce.manage");
    const workerId = text(form, "workerId");
    if (!(await db.workforceMember.findFirst({ where: { id: workerId, tenantId }, select: { id: true } }))) fail("Select a worker");
    const accountId = optional(form, "accountId");
    if (accountId && !(await db.moneyAccount.findFirst({ where: { id: accountId, tenantId }, select: { id: true } }))) fail("Account not found");
    const advance = await db.workerAdvance.create({ data: { tenantId, workerId, accountId, amount: z.number().positive().parse(numberValue(form, "amount")), issuedAt: dateValue(form, "issuedAt") || new Date(), reason: optional(form, "reason"), createdById: userId } });
    await audit("workforce.advance", "WorkerAdvance", advance.id, { amount: advance.amount.toString() });
    revalidatePath("/workforce");
    revalidatePath("/payroll");
    revalidatePath("/accounts");
    return "Advance recorded; it will be recovered in the next pay run";
  });
}

// ── Payroll ─────────────────────────────────────────────────────────────────

function monthsInPeriod(start: Date, end: Date) {
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  if (start.getDate() === 1 && end.getFullYear() === start.getFullYear() && end.getMonth() === start.getMonth() && end.getDate() === lastDay) return 1;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return round2(days / 30.4375);
}

export async function createPayRunAction(form: FormData) {
  let payRunId = "";
  const result = await attempt(async () => {
    const { tenantId, userId } = await context("workforce.manage");
    const periodStart = dateValue(form, "periodStart");
    const periodEnd = dateValue(form, "periodEnd");
    if (!periodStart || !periodEnd || periodEnd < periodStart) fail("Choose a valid pay period");
    const start = new Date(periodStart); start.setHours(0, 0, 0, 0);
    const end = new Date(periodEnd); end.setHours(23, 59, 59, 999);
    const farmId = optional(form, "farmId");
    const workers = await db.workforceMember.findMany({
      where: { tenantId, active: true, ...(farmId ? { farmId } : {}) },
      include: {
        timesheets: { where: { status: TimesheetStatus.APPROVED, payRunId: null, workDate: { gte: start, lte: end } } },
        advances: { where: { payRunId: null }, orderBy: { issuedAt: "asc" } },
      },
    });
    const months = monthsInPeriod(start, end);
    const lines = workers.map(w => {
      const fromTimesheets = round2(w.timesheets.reduce((s, t) => s + labourCost(t), 0));
      const salary = w.payBasis === "MONTHLY" ? round2(Number(w.monthlySalary || 0) * months) : 0;
      const gross = round2(fromTimesheets + salary);
      const hours = w.timesheets.reduce((s, t) => s + Number(t.hours), 0);
      const units = w.payBasis === "DAILY" ? round2(hours / STANDARD_DAY_HOURS) : w.payBasis === "PIECE_RATE" ? w.timesheets.reduce((s, t) => s + Number(t.pieceQuantity || 0), 0) : w.payBasis === "MONTHLY" ? months : round2(hours);
      let recovery = 0;
      const recovered: string[] = [];
      for (const a of w.advances) {
        if (recovery + Number(a.amount) > gross + 0.005) break;
        recovery = round2(recovery + Number(a.amount));
        recovered.push(a.id);
      }
      return { w, gross, units, recovery, recovered, timesheetIds: w.timesheets.map(t => t.id) };
    }).filter(l => l.gross > 0);
    if (!lines.length) fail("No approved, unpaid work or salaries found for this period");
    const run = await db.$transaction(async tx => {
      const runNo = await nextDocumentNumber(tx, tenantId, "payRun");
      const created = await tx.payRun.create({
        data: {
          tenantId, runNo, periodStart: start, periodEnd: end, notes: optional(form, "notes"), createdById: userId,
          lines: { create: lines.map(l => ({ tenantId, workerId: l.w.id, basis: l.w.payBasis, units: l.units, grossPay: l.gross, advanceRecovery: l.recovery, netPay: round2(l.gross - l.recovery), paymentMethod: l.w.paymentMethod })) },
        },
      });
      // Reserve the timesheets and advances so they cannot be paid twice.
      await tx.timesheet.updateMany({ where: { id: { in: lines.flatMap(l => l.timesheetIds) } }, data: { payRunId: created.id } });
      await tx.workerAdvance.updateMany({ where: { id: { in: lines.flatMap(l => l.recovered) } }, data: { payRunId: created.id } });
      return created;
    });
    payRunId = run.id;
    await audit("payroll.create", "PayRun", run.id, { runNo: run.runNo, workers: lines.length });
    revalidatePath("/payroll");
  });
  if (result.ok && payRunId) redirect(`/payroll/${payRunId}`);
  return result;
}

export async function updatePayRunLineAction(form: FormData) {
  return attempt(async () => {
    const { tenantId } = await context("workforce.manage");
    const id = text(form, "id");
    const line = await db.payRunLine.findFirst({ where: { id, tenantId }, include: { payRun: { select: { status: true } } } });
    if (!line || line.payRun.status !== PayRunStatus.DRAFT) fail("Only draft pay runs can be edited");
    const allowances = numberValue(form, "allowances") ?? 0;
    const deductions = numberValue(form, "deductions") ?? 0;
    if (allowances < 0 || deductions < 0) fail("Amounts cannot be negative");
    const netPay = round2(Number(line.grossPay) + allowances - deductions - Number(line.advanceRecovery));
    if (netPay < 0) fail("Deductions are more than this worker's pay");
    await db.payRunLine.update({ where: { id }, data: { allowances, deductions, netPay, notes: optional(form, "notes") || null } });
    revalidatePath(`/payroll/${line.payRunId}`);
    return "Line updated";
  });
}

export async function setPayRunStatusAction(form: FormData) {
  return attempt(async () => {
    const id = text(form, "id");
    const status = z.nativeEnum(PayRunStatus).parse(text(form, "status"));
    const { tenantId, userId } = await context(status === "PAID" ? "finance.manage" : "workforce.manage");
    const run = await db.payRun.findFirst({ where: { id, tenantId }, include: { lines: true } });
    if (!run) fail("Pay run not found");
    const transitions: Record<PayRunStatus, PayRunStatus[]> = { DRAFT: ["APPROVED", "CANCELLED"], APPROVED: ["PAID", "DRAFT", "CANCELLED"], PAID: [], CANCELLED: [] };
    if (!transitions[run.status].includes(status)) fail(`A ${run.status.toLowerCase()} pay run cannot be ${status.toLowerCase()}`);
    await db.$transaction(async tx => {
      if (status === "CANCELLED") {
        await tx.timesheet.updateMany({ where: { payRunId: id }, data: { payRunId: null } });
        await tx.workerAdvance.updateMany({ where: { payRunId: id }, data: { payRunId: null } });
      }
      let accountId: string | undefined;
      if (status === "PAID") {
        accountId = optional(form, "accountId");
        if (!accountId || !(await tx.moneyAccount.findFirst({ where: { id: accountId, tenantId }, select: { id: true } }))) fail("Choose the account wages were paid from");
        // Wage cost appears in organisation expenses; cash movement is tracked on the pay run itself (no account here, so it is not counted twice).
        const cost = round2(run.lines.reduce((s, l) => s + Number(l.grossPay) + Number(l.allowances), 0));
        await tx.expense.create({ data: { tenantId, category: "Salaries & wages", description: `Payroll ${run.runNo}`, amount: cost, status: "PAID", paidAt: new Date(), incurredAt: run.periodEnd, reference: run.runNo } });
      }
      await tx.payRun.update({ where: { id }, data: { status, ...(status === "PAID" ? { accountId, paidAt: new Date() } : {}) } });
    });
    await audit("payroll.status", "PayRun", id, { status, by: userId });
    revalidatePath("/payroll");
    revalidatePath(`/payroll/${id}`);
    revalidatePath("/accounts");
    revalidatePath("/finance");
    return `Pay run ${status.toLowerCase()}`;
  });
}

// ── Team & access ───────────────────────────────────────────────────────────

async function ownerCount(tenantId: string) {
  return db.membership.count({ where: { tenantId, role: Role.OWNER } });
}

export async function changeMemberRoleAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, role: actorRole } = await context("team.manage");
    const id = text(form, "id");
    const role = z.nativeEnum(Role).parse(text(form, "role"));
    const member = await db.membership.findFirst({ where: { id, tenantId } });
    if (!member) fail("Member not found");
    if ((member.role === Role.OWNER || role === Role.OWNER) && actorRole !== Role.OWNER) fail("Only an owner can grant or change owner access");
    if (member.role === Role.OWNER && role !== Role.OWNER && (await ownerCount(tenantId)) <= 1) fail("The organization must keep at least one owner");
    await db.membership.update({ where: { id }, data: { role } });
    await audit("membership.role", "Membership", id, { role, by: userId });
    revalidatePath("/team");
    return "Role updated";
  });
}

export async function removeMemberAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, role: actorRole } = await context("team.manage");
    const id = text(form, "id");
    const member = await db.membership.findFirst({ where: { id, tenantId } });
    if (!member) fail("Member not found");
    if (member.userId === userId) fail("You cannot remove yourself");
    if (member.role === Role.OWNER && (actorRole !== Role.OWNER || (await ownerCount(tenantId)) <= 1)) fail("Owners can only be removed by another owner");
    await db.membership.delete({ where: { id } });
    await audit("membership.remove", "Membership", id, { userId: member.userId });
    revalidatePath("/team");
    return "Member removed";
  });
}

export async function revokeInvitationAction(form: FormData) {
  return attempt(async () => {
    const { tenantId } = await context("team.manage");
    const id = text(form, "id");
    const result = await db.invitation.updateMany({ where: { id, tenantId, status: "PENDING" }, data: { status: "REVOKED" } });
    if (!result.count) fail("Invitation is no longer pending");
    await audit("invitation.revoke", "Invitation", id);
    revalidatePath("/team");
    return "Invitation revoked";
  });
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Admin-issued reset link, shared with the user over WhatsApp/SMS where email is unreliable. Valid for 24 hours, single use. */
export async function createPasswordResetLinkAction(form: FormData) {
  return attempt(async () => {
    const { tenantId, userId, role: actorRole } = await context("team.manage");
    const member = await db.membership.findFirst({ where: { id: text(form, "id"), tenantId }, include: { user: true } });
    if (!member) fail("Member not found");
    if (member.role === Role.OWNER && actorRole !== Role.OWNER) fail("Only an owner can reset an owner's password");
    const token = randomBytes(24).toString("hex");
    await db.passwordResetToken.create({ data: { userId: member.userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000), createdById: userId } });
    await audit("password.reset_link", "User", member.userId);
    return `Reset link for ${member.user.name} (valid 24h, single use). Send it to them privately: ${await appOrigin()}/reset/${token}`;
  });
}

export async function resetPasswordAction(form: FormData) {
  const token = text(form, "token");
  const result = await attempt(async () => {
    const password = z.string().min(10, "Use at least 10 characters").parse(text(form, "password"));
    if (password !== text(form, "confirm")) fail("The two passwords do not match");
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) fail("This reset link has expired or was already used. Ask your administrator for a new one.");
    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
  });
  if (result.ok) redirect("/login?reset=1");
  return result;
}

export async function changePasswordAction(form: FormData) {
  return attempt(async () => {
    const { userId } = await context("farm.view");
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(text(form, "current"), user.passwordHash))) fail("Your current password is incorrect");
    const password = z.string().min(10, "Use at least 10 characters").parse(text(form, "password"));
    if (password !== text(form, "confirm")) fail("The two new passwords do not match");
    await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
    await audit("password.change", "User", userId);
    return "Password changed";
  });
}

export async function updateProfileAction(form: FormData) {
  return attempt(async () => {
    const { userId } = await context("farm.view");
    const phoneRaw = optional(form, "phone");
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phone && phone.replace("+", "").length < 7) fail("Enter a valid phone number");
    if (phone && (await db.user.findFirst({ where: { phone, id: { not: userId } }, select: { id: true } }))) fail("That phone number is already used by another account");
    await db.user.update({ where: { id: userId }, data: { name: z.string().min(2).parse(text(form, "name")), phone } });
    await audit("profile.update", "User", userId);
    revalidatePath("/profile");
    return "Profile saved";
  });
}
