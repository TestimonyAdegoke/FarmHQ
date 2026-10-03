import Link from "next/link";
import { CloudRain, CloudSun, Droplets, History, Navigation, Wind } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber } from "@/lib/utils";
import { getFarmWeather, weatherLabel } from "@/lib/weather";

export const metadata = { title: "Weather" };

export default async function WeatherPage() {
  const ctx = await tenantContext();
  const farms = await db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } });
  const located = farms.filter(f=>f.latitude!=null&&f.longitude!=null);
  const results = await Promise.all(located.map(async (farm) => {
    try {
      return { farm, weather: await getFarmWeather(Number(farm.latitude), Number(farm.longitude)), error: null };
    } catch (error) {
      return { farm, weather: null, error: error instanceof Error ? error.message : "Weather unavailable" };
    }
  }));
  const first = results.find(r=>r.weather)?.weather;

  return <><PageHeader eyebrow="Farm weather" title="Weather intelligence" description="Seven-day weather context for every geolocated farm, cached server-side to avoid unnecessary provider traffic." action={<Link className="button secondary" href="/weather-history"><History size={16}/> Historical weather</Link>}/>
    <section className="metrics"><MetricCard label="Geolocated farms" value={`${located.length}/${farms.length}`} hint="Set coordinates under Farm Maps" icon={<Navigation size={18}/>}/><MetricCard label="Current temperature" value={first?`${formatNumber(first.current.temperature,1)}°C`:"—"} hint={first?weatherLabel(first.current.weatherCode):"No weather loaded"} icon={<CloudSun size={18}/>}/><MetricCard label="Humidity" value={first?`${formatNumber(first.current.humidity,0)}%`:"—"} hint="First available farm" icon={<Droplets size={18}/>}/><MetricCard label="Wind" value={first?`${formatNumber(first.current.windSpeed,1)} km/h`:"—"} hint="Current surface wind" icon={<Wind size={18}/>}/></section>
    {!located.length?<div className="card"><div className="empty"><strong>No farms have coordinates yet</strong><span>Open Farm Maps and save each farm latitude and longitude to enable forecasts.</span></div></div>:null}
    <div className="grid-2">{results.map(({farm,weather,error})=><div className="card" key={farm.id}><div className="card-head"><div><h2>{farm.name}</h2><div className="muted" style={{fontSize:13,marginTop:4}}>{farm.state||farm.country||"Farm location"}</div></div><CloudSun size={22} color="var(--brand)"/></div>{error?<div className="alert"><div><b>Forecast unavailable</b><small>{error}</small></div></div>:weather?<><div style={{display:"flex",gap:22,alignItems:"end",marginBottom:20}}><div><strong style={{fontSize:40}}>{formatNumber(weather.current.temperature,1)}°C</strong><div className="muted">{weatherLabel(weather.current.weatherCode)}</div></div><div className="muted" style={{fontSize:13,lineHeight:1.8}}><div><Droplets size={14} style={{verticalAlign:"middle"}}/> {weather.current.humidity}% humidity</div><div><CloudRain size={14} style={{verticalAlign:"middle"}}/> {weather.current.precipitation} mm precipitation</div><div><Wind size={14} style={{verticalAlign:"middle"}}/> {weather.current.windSpeed} km/h</div></div></div><div className="table-wrap"><table style={{minWidth:540}}><thead><tr><th>Day</th><th>Conditions</th><th>Temperature</th><th>Rain</th><th>Wind</th></tr></thead><tbody>{weather.daily.map(day=><tr key={day.date}><td>{new Intl.DateTimeFormat("en-NG",{weekday:"short",month:"short",day:"numeric"}).format(new Date(day.date+"T12:00:00"))}</td><td>{weatherLabel(day.weatherCode)}</td><td>{formatNumber(day.min,0)}–{formatNumber(day.max,0)}°C</td><td>{formatNumber(day.precipitation,1)} mm · {day.precipitationProbability}%</td><td>{formatNumber(day.wind,1)} km/h</td></tr>)}</tbody></table></div></>:null}</div>)}</div>
  </>;
}
