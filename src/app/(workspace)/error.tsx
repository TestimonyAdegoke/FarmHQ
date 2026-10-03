"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return <div className="card state-card">
    <span className="icon-box warn" aria-hidden><AlertTriangle size={20} /></span>
    <h2>{offline ? "You are offline" : "This page could not be loaded"}</h2>
    <p>{offline ? "Check your network and try again. The Field App keeps working without signal." : "Something went wrong on our side. Your data is safe; please try again. If it keeps happening, share the reference below with support."}</p>
    {error.digest ? <p className="small-text">Reference: {error.digest}</p> : null}
    <div className="inline-actions">
      <button className="button" onClick={() => retry()}><RefreshCw size={16} /> Try again</button>
      <Link className="button secondary" href={offline ? "/field" : "/dashboard"}>{offline ? "Open Field App" : "Go to overview"}</Link>
    </div>
  </div>;
}
