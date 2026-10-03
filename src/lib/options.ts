export const paymentMethods = [
  ["CASH", "Cash"],
  ["MOBILE_MONEY", "Mobile money"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["POS_CARD", "POS / card"],
  ["CHEQUE", "Cheque"],
  ["OTHER", "Other"],
] as const;

export const revenueTypes = [
  ["HARVEST_SALE", "Crop / produce sale"],
  ["EGGS", "Eggs"],
  ["LIVESTOCK_SALE", "Livestock sale"],
  ["FISH_SALE", "Fish sale"],
  ["MILK", "Milk"],
  ["SERVICE", "Service (e.g. tractor hire)"],
  ["OTHER", "Other income"],
] as const;

export const payBases = [
  ["DAILY", "Daily rate (casual labour)"],
  ["HOURLY", "Hourly rate"],
  ["MONTHLY", "Monthly salary"],
  ["PIECE_RATE", "Piece rate (per crate, bag, kg…)"],
] as const;

export const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

export function invoiceStatusClass(status: string) {
  return status === "PAID" ? "" : status === "OVERDUE" ? "danger" : status === "VOID" ? "neutral" : status === "PARTIALLY_PAID" ? "warn" : "info";
}
