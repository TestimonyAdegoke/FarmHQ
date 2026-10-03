"use client";

import { useSyncExternalStore } from "react";
import { CloudOff } from "lucide-react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Tells field users immediately when they lose signal, and where offline capture still works. */
export function ConnectionBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return <div className="offline-banner" role="status"><CloudOff size={16}/> You are offline. Saved pages stay readable; use the <a href="/field">Field App</a> to keep recording work — it syncs when signal returns.</div>;
}
