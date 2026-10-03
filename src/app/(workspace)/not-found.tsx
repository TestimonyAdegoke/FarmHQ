import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <div className="card state-card">
    <span className="icon-box" aria-hidden><SearchX size={20} /></span>
    <h2>Record not found</h2>
    <p>It may have been removed, or it belongs to another workspace.</p>
    <div className="inline-actions"><Link className="button" href="/dashboard">Go to overview</Link></div>
  </div>;
}
