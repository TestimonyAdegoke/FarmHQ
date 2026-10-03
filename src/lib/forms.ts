import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

export function optional(form: FormData, key: string) {
  return text(form, key) || undefined;
}

export function numberValue(form: FormData, key: string) {
  const raw = text(form, key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function integerValue(form: FormData, key: string) {
  const value = numberValue(form, key);
  return value == null ? undefined : Math.trunc(value);
}

export function dateValue(form: FormData, key: string) {
  const value = text(form, key);
  return value ? new Date(`${value}T12:00:00`) : undefined;
}

/** Reads repeated line-item inputs (same field names repeated per row) into row objects, skipping blank rows. */
export function lineItems(form: FormData) {
  const descriptions = form.getAll("lineDescription").map(String);
  const products = form.getAll("lineProductId").map(String);
  const quantities = form.getAll("lineQuantity").map(String);
  const units = form.getAll("lineUnit").map(String);
  const prices = form.getAll("lineUnitPrice").map(String);
  const rows: { productId?: string; description: string; quantity: number; unit: string; unitPrice: number }[] = [];
  for (let i = 0; i < quantities.length; i++) {
    const quantity = Number(quantities[i]);
    const description = (descriptions[i] || "").trim();
    const productId = (products[i] || "").trim() || undefined;
    if (!quantities[i]?.trim() && !description && !productId) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) throw new UserError(`Line ${i + 1}: enter a quantity greater than zero`);
    const unitPrice = Number(prices[i] || 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new UserError(`Line ${i + 1}: enter a valid price`);
    rows.push({ productId, description, quantity, unit: (units[i] || "").trim() || "unit", unitPrice });
  }
  if (!rows.length) throw new UserError("Add at least one line item");
  return rows;
}

/** An error whose message is safe and useful to show the person who submitted the form. */
export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}

function friendly(error: unknown) {
  if (error instanceof UserError) return error.message;
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return field ? `Please check “${field}”: ${issue.message}` : issue?.message || "Some fields are invalid";
  }
  const code = (error as { code?: string })?.code;
  if (code === "P2002") return "A record with the same name or number already exists.";
  if (code === "P2003") return "This record is linked to other records and cannot be changed that way.";
  if (code === "P2025") return "The record no longer exists. Refresh the page and try again.";
  if (error instanceof Error && error.message === "Forbidden") return "Your role does not allow this action.";
  if (error instanceof Error && /not found|invalid|cannot|select/i.test(error.message)) return error.message;
  return "Something went wrong while saving. Please try again.";
}

/** Runs a mutation and converts thrown errors into a result the form can display inline. */
export async function attempt(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (error) {
    unstable_rethrow(error);
    if (!(error instanceof UserError) && !(error instanceof ZodError)) console.error(error);
    return { ok: false, error: friendly(error) };
  }
}
