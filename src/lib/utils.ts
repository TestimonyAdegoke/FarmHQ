export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatMoney(value: number | string | { toString(): string }, currency = "NGN") {
  const number = typeof value === "number" ? value : Number(value.toString());
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(number || 0);
}

export function formatNumber(value: number | string | { toString(): string }, max = 1) {
  const number = typeof value === "number" ? value : Number(value.toString());
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: max }).format(number || 0);
}

export function safeDate(value?: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value));
}

/** Canonical phone form for lookups: digits only, keeping a leading "+" (e.g. "+234 803-000 0000" → "+2348030000000"). */
export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** wa.me deep link for sharing documents over WhatsApp, the default business channel for many farms. */
export function whatsappLink(phone: string | null | undefined, message: string) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** yyyy-mm-dd in local time for <input type="date"> (toISOString would shift dates across midnight UTC). */
export function toDateInput(value?: Date | null) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
