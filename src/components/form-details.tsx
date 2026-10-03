import type { ReactNode } from "react";

/** Keeps create-forms one tap away so lists and numbers come first on a phone. */
export function FormDetails({ title, hint, open, children }: { title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return <details className="form-details" open={open}><summary><span>{title}{hint ? <small>{hint}</small> : null}</span></summary><div className="details-body">{children}</div></details>;
}
