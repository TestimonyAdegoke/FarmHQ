export const STANDARD_DAY_HOURS = 8;

const round2 = (n: number) => Math.round(n * 100) / 100;

type Payable = { payBasis: string; defaultHourlyRate: unknown; dailyRate: unknown; pieceRate: unknown };

/** Timesheet costing for one day's attendance, according to how the worker is paid. */
export function attendanceCost(worker: Payable, hours: number, pieces?: number) {
  if (worker.payBasis === "DAILY") {
    const daily = Number(worker.dailyRate || 0);
    return { hourlyRate: round2(daily / STANDARD_DAY_HOURS), amount: round2(daily * hours / STANDARD_DAY_HOURS) };
  }
  if (worker.payBasis === "PIECE_RATE") return { hourlyRate: 0, amount: round2(Number(worker.pieceRate || 0) * (pieces || 0)) };
  // Salaried staff are paid through payroll; attendance is recorded for tracking only.
  if (worker.payBasis === "MONTHLY") return { hourlyRate: 0, amount: 0 };
  return { hourlyRate: Number(worker.defaultHourlyRate || 0), amount: undefined };
}
