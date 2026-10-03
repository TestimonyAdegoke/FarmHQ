export default function Loading() {
  return <div aria-busy="true" aria-label="Loading">
    <div className="skeleton" style={{ width: 120, height: 12, marginBottom: 12 }} />
    <div className="skeleton" style={{ width: 260, height: 30, marginBottom: 26 }} />
    <div className="metrics">{[0, 1, 2, 3].map(i => <div key={i} className="metric"><div className="skeleton" style={{ width: "60%", height: 12 }} /><div className="skeleton" style={{ width: "45%", height: 26, marginTop: 16 }} /></div>)}</div>
    <div className="card"><div className="skeleton" style={{ height: 180 }} /></div>
  </div>;
}
