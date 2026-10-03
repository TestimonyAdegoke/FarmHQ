"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print / save PDF" }: { label?: string }) {
  return <button type="button" className="button secondary small" onClick={() => window.print()}><Printer size={15} /> {label}</button>;
}
