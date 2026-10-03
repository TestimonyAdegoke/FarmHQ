import type { ReactNode } from "react";
export function MetricCard({ label, value, hint, icon }: { label:string; value:string; hint?:string; icon?:ReactNode }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span>{icon ? <span className="icon-box" aria-hidden>{icon}</span> : null}</div><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}
