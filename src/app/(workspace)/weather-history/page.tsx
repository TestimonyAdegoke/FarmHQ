import Link from "next/link";
import { CloudRain, Droplets, History, ThermometerSun } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber } from "@/lib/utils";
import { defaultHistoryRange, getWeatherHistory } from "@/lib/weather-history";

export const metadata = { title: "Weather History" };

export default async function WeatherHistoryPage({ searchParams }: { searchParams: Promise<{ farmId?: string; start?: string; end?: string }> }) {
  const ctx = await tenantContext("farm.view");
  const query = await searchParams;
  const farms = await db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, latitude: { not: null }, longitude: { not: null } }, orderBy: { name: "asc" } });
  const defaults = defaultHistoryRange();
  const selected = farms.find(f=>f.id===query.farmId) || farms[0];
  const start = /^\d{4}-\d{2}-\d{2}$/.test(query.start||"") ? query.start! : defaults.start;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(query.end||"") ? query.end! : defaults.end;

  let history = null;
  let error: string | null = null;
  if (selected) {
    try {
      history = await getWeatherHistory(Number(selected.latitude), Number(selected.longitude), start, end);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Historical weather unavailable";
    }
  }

  return <><PageHeader eyebrow="Climate context" title="Historical weather" description="Compare rainfall, evapotranspiration and temperature history for geolocated farms using reanalysis weather data." action={<Link className="button secondary" href="/weather">Forecast</Link>}/>
    <form className="form-card" method="get"><div className="form-grid"><div className="field"><label>Farm</label><select name="farmId" defaultValue={selected?.id||""}>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Start</label><input name="start" type="date" defaultValue={start}/></div><div className="field"><label>End</label><input name="end" type="date" defaultValue={end}/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Load history</button></div></form>
    {!selected?<div className="card"><div className="empty"><strong>No geolocated farms</strong><span>Set farm coordinates under Farm Maps first.</span></div></div>:error?<div className="card"><div className="alert"><CloudRain size={18}/><div><b>History unavailable</b><small>{error}</small></div></div></div>:history?<><section className="metrics"><MetricCard label="Rainfall" value={formatNumber(history.totalRainfall,1)+" mm"} hint={String(history.rainyDays)+" days ≥ 1 mm"} icon={<CloudRain size={18}/>}/><MetricCard label="Mean daily max" value={history.meanMaxTemperature==null?"—":formatNumber(history.meanMaxTemperature,1)+"°C"} hint={start+" to "+end} icon={<ThermometerSun size={18}/>}/><MetricCard label="Reference ET₀" value={formatNumber(history.totalEt0,1)+" mm"} hint="FAO reference evapotranspiration" icon={<Droplets size={18}/>}/><MetricCard label="Days loaded" value={String(history.daily.length)} hint={selected.name} icon={<History size={18}/>} /></section><div className="card"><div className="card-head"><div><h2>{selected.name}</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Daily reanalysis history</div></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Min / max</th><th>Rainfall</th><th>ET₀</th></tr></thead><tbody>{history.daily.slice().reverse().map(day=><tr key={day.date}><td>{day.date}</td><td>{day.min==null?"—":formatNumber(day.min,1)}° / {day.max==null?"—":formatNumber(day.max,1)}°C</td><td>{day.precipitation==null?"—":formatNumber(day.precipitation,1)+" mm"}</td><td>{day.et0==null?"—":formatNumber(day.et0,1)+" mm"}</td></tr>)}</tbody></table></div></div></>:null}
  </>;
}
