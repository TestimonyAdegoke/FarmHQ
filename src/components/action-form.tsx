"use client";

import { useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type ReactNode } from "react";

const noopSubscribe = () => () => {};

type Result = { ok: boolean; error?: string; message?: string } | void | undefined;

/**
 * Submits a server action without a full page error on failure: validation problems are shown inline,
 * inputs are locked while saving (no double posts on slow mobile networks) and create-forms reset on success.
 */
export function ActionForm({ action, children, className, style, reset = true, success, confirm, id }: {
  action: (form: FormData) => Promise<Result>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  reset?: boolean;
  success?: string;
  confirm?: string;
  id?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ error?: string; message?: string } | null>(null);
  // False during server render and hydration: keeps inputs locked until the submit handler is attached, so a quick
  // tap on a slow phone cannot fall back to a native submit that puts form data in the URL.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setState(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result && result.ok === false) {
          setState({ error: result.error || "Could not save." });
          return;
        }
        if (reset) form.reset();
        const message = (result && result.message) || success;
        if (message) setState({ message });
      } catch (error) {
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        setState({ error: offline ? "You are offline. Reconnect and submit again." : process.env.NODE_ENV === "development" && error instanceof Error ? error.message : "Could not save. Check the required fields and try again." });
      }
    });
  }

  return <form ref={ref} id={id} className={className} style={style} onSubmit={onSubmit} method="post" aria-busy={pending || !hydrated}>
    <fieldset disabled={pending || !hydrated} className="action-fieldset">{children}</fieldset>
    {state?.error ? <div className="error-banner" role="alert">{state.error}</div> : null}
    {state?.message ? <div className="success-banner" role="status">{state.message}</div> : null}
  </form>;
}
