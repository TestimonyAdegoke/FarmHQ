"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return <div className="card" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center", padding: 32 }}>
    <span className="icon-box" style={{ margin: "0 auto 14px", width: 48, height: 48, background: "#fbf3df", color: "var(--warning)" }}><AlertTriangle size={22} /></span>
    <h2 style={{ marginBottom: 8 }}>{offline ? "You are offline" : "This page could not be loaded"}</h2>
    <p className="muted" style={{ lineHeight: 1.6 }}>{offline ? "Check your network and try again. The Field App keeps working without signal." : "Something went wrong on our side. Your data is safe; please try again. If it keeps happening, share the reference below with support."}</p>
    {error.digest ? <p className="muted small-text">Reference: {error.digest}</p> : null}
    <div className="inline-actions" style={{ justifyContent: "center", marginTop: 16 }}>
      <button className="button" onClick={() => retry()}><RefreshCw size={16} /> Try again</button>
      <Link className="button secondary" href={offline ? "/field" : "/dashboard"}>{offline ? "Open Field App" : "Go to overview"}</Link>
    </div>
  </div>;
}
