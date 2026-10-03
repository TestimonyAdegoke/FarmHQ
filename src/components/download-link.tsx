import { Download } from "lucide-react";

/** Link to a CSV download from `/api/export/[dataset]`, optionally limited to a date range (YYYY-MM-DD). */
export function DownloadLink({ dataset, from, to, label = "CSV", className = "button secondary small" }: { dataset: string; from?: string; to?: string; label?: string; className?: string }) {
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return <a className={`${className} no-print`} href={`/api/export/${dataset}${qs ? `?${qs}` : ""}`} download title="Download as a spreadsheet (CSV)"><Download size={14} aria-hidden /> {label}</a>;
}

/** Local calendar date as YYYY-MM-DD, the format the export route accepts. */
export function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
