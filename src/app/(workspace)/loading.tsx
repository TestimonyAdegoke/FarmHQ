export default function Loading() {
  return <div aria-busy="true" aria-label="Loading" className="stack">
    <div><div className="skeleton" style={{ width: 110, height: 11, marginBottom: 12 }} /><div className="skeleton" style={{ width: 280, height: 32 }} /></div>
    <div className="metrics">{[0, 1, 2, 3].map(i => <div key={i} className="metric"><div className="skeleton" style={{ width: "55%", height: 11 }} /><div className="skeleton" style={{ width: "40%", height: 24, marginTop: 14 }} /></div>)}</div>
    <div className="card"><div className="skeleton" style={{ height: 200 }} /></div>
  </div>;
}
