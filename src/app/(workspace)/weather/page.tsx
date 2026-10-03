import Link from "next/link";
import { AlertTriangle, CloudSun, Droplets, History, Navigation, Wind } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber } from "@/lib/utils";
import { getFarmWeather, weatherLabel } from "@/lib/weather";
import { buildWeatherAdvisories } from "@/lib/weather-advisories";

export const metadata = { title: "Weather" };

export default async function WeatherPage() {
  const ctx = await tenantContext("farm.view");
  const farms = await db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } });
  const located = farms.filter(f=>f.latitude!=null&&f.longitude!=null);
  const results = await Promise.all(located.map(async (farm) => {
    try {
      const weather = await getFarmWeather(Number(farm.latitude), Number(farm.longitude));
      return { farm, weather, advisories: buildWeatherAdvisories(weather), error: null };
    } catch (error) {
      return { farm, weather: null, advisories: [], error: error instanceof Error ? error.message : "Weather unavailable" };
    }
  }));
  const first = results.find(r=>r.weather)?.weather;

  return <><PageHeader eyebrow="Farm weather" title="Weather" description="Seven-day forecast and spraying, planting and harvest advice for every farm with a map location." action={<Link className="button secondary" href="/weather-history"><History size={16}/> Historical weather</Link>}/>
    <section className="metrics"><MetricCard label="Geolocated farms" value={`${located.length}/${farms.length}`} hint="Set coordinates under Farm Maps" icon={<Navigation size={16}/>}/><MetricCard label="Current temperature" value={first?`${formatNumber(first.current.temperature,1)}°C`:"—"} hint={first?weatherLabel(first.current.weatherCode):"No weather loaded"} icon={<CloudSun size={16}/>}/><MetricCard label="Humidity" value={first?`${formatNumber(first.current.humidity,0)}%`:"—"} hint="First available farm" icon={<Droplets size={16}/>}/><MetricCard label="Wind" value={first?`${formatNumber(first.current.windSpeed,1)} km/h`:"—"} hint="Current surface wind" icon={<Wind size={16}/>}/></section>
    {!located.length?<div className="card"><EmptyState title="No farms have coordinates yet" text="Open Farm Maps and save each farm's latitude and longitude to get forecasts." icon={<Navigation size={20}/>}/></div>:null}
    {results.length?<div className="grid-2">{results.map(({farm,weather,advisories,error})=><div className="card" key={farm.id}>
      <div className="card-head"><div><h2>{farm.name}</h2><div className="card-sub">{farm.state||farm.country||"Farm location"}</div></div></div>
      {error?<div className="error-banner" role="alert"><b>Forecast unavailable.</b> {error}</div>:weather?<div className="stack">
        <div className="grid-2" style={{alignItems:"end"}}>
          <div><strong className="figure">{formatNumber(weather.current.temperature,1)}°C</strong><div className="muted">{weatherLabel(weather.current.weatherCode)}</div></div>
          <dl className="kv"><dt>Humidity</dt><dd>{weather.current.humidity}%</dd><dt>Precipitation</dt><dd>{weather.current.precipitation} mm</dd><dt>Wind</dt><dd>{weather.current.windSpeed} km/h</dd></dl>
        </div>
        {advisories.length?<div className="alert-list">{advisories.map((advisory,index)=><div className="alert" key={advisory.title+String(index)}><AlertTriangle size={16} color={advisory.level==="CRITICAL"?"var(--danger)":advisory.level==="WARNING"?"var(--warning)":"var(--brand)"}/><div><b>{advisory.title}</b><small>{advisory.body}</small></div></div>)}</div>:null}
        <div className="table-wrap"><table style={{minWidth:540}}><thead><tr><th>Day</th><th>Conditions</th><th className="text-right">Temperature</th><th className="text-right">Rain</th><th className="text-right">Wind</th></tr></thead><tbody>{weather.daily.map(day=><tr key={day.date}><td>{new Intl.DateTimeFormat("en-NG",{weekday:"short",month:"short",day:"numeric"}).format(new Date(day.date+"T12:00:00"))}</td><td>{weatherLabel(day.weatherCode)}</td><td className="text-right">{formatNumber(day.min,0)}–{formatNumber(day.max,0)}°C</td><td className="text-right">{formatNumber(day.precipitation,1)} mm<div className="sub">{day.precipitationProbability}% chance</div></td><td className="text-right">{formatNumber(day.wind,1)} km/h</td></tr>)}</tbody></table></div>
      </div>:null}
    </div>)}</div>:null}
  </>;
}
