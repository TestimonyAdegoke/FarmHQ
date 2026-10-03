import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return <main className="auth-shell"><section className="auth-card">
    <Brand/>
    <h1>You are offline</h1>
    <p>This page needs a connection. Work you capture in the Field App stays on this device and syncs when signal returns.</p>
    <div className="inline-actions auth-actions">
      <Link className="button" href="/field">Open Field App</Link>
      <Link className="button secondary" href="/dashboard">Try again</Link>
    </div>
  </section></main>;
}
