import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return <main className="auth-shell"><section className="auth-card"><Brand/><div className="eyebrow" style={{marginTop:24}}>Offline mode</div><h1>You are offline.</h1><p>FarmHQ can keep its application shell available without connectivity. Offline data capture and queued write synchronization are the next mobile layer; authenticated live records still require a connection in this web build.</p><Link className="button" href="/dashboard" style={{marginTop:14}}>Try reconnecting</Link></section></main>;
}
