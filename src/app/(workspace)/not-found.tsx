import Link from "next/link";

export default function NotFound() {
  return <div className="card" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center", padding: 32 }}>
    <h2>Record not found</h2>
    <p className="muted">It may have been removed, or it belongs to another workspace.</p>
    <Link className="button" href="/dashboard" style={{ marginTop: 10 }}>Go to overview</Link>
  </div>;
}
