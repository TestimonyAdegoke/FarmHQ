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
