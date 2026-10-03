import type { FarmWeather } from "@/lib/weather";

export type WeatherAdvisory = {
  level: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
};

export function buildWeatherAdvisories(weather: FarmWeather): WeatherAdvisory[] {
  const next2 = weather.daily.slice(0,2);
  const next3 = weather.daily.slice(0,3);
  const sevenDayRain = weather.daily.reduce((sum,day)=>sum+Number(day.precipitation||0),0);
  const rain48 = next2.reduce((sum,day)=>sum+Number(day.precipitation||0),0);
  const maxRainProbability = Math.max(0,...next2.map(day=>Number(day.precipitationProbability||0)));
  const maxWind = Math.max(Number(weather.current.windSpeed||0),...next3.map(day=>Number(day.wind||0)));
  const maxTemp = Math.max(Number(weather.current.temperature||0),...next3.map(day=>Number(day.max||0)));
  const advisories: WeatherAdvisory[] = [];

  if (maxWind >= 30) {
    advisories.push({
      level: maxWind >= 45 ? "CRITICAL" : "WARNING",
      title: "High wind spray risk",
      body: "Wind may increase spray drift and reduce application accuracy. Recheck conditions before pesticide, foliar-feed or herbicide work.",
    });
  }

  if (rain48 >= 15 || (maxRainProbability >= 80 && rain48 >= 5)) {
    advisories.push({
      level: rain48 >= 35 ? "CRITICAL" : "WARNING",
      title: "Material rainfall expected",
      body: "Review irrigation, drainage and chemical timing. Heavy rain soon after application can reduce efficacy and increase runoff risk.",
    });
  }

  if (maxTemp >= 35) {
    advisories.push({
      level: maxTemp >= 40 ? "CRITICAL" : "WARNING",
      title: "Heat stress window",
      body: "Plan heat-sensitive work earlier in the day and review water availability for crops and livestock.",
    });
  }

  if (sevenDayRain < 5) {
    advisories.push({
      level: "INFO",
      title: "Dry seven-day outlook",
      body: "Forecast rainfall is limited. Check soil moisture and irrigation schedules for actively growing production units.",
    });
  }

  if (weather.current.humidity >= 85 && weather.current.temperature >= 20 && weather.current.temperature <= 32) {
    advisories.push({
      level: "INFO",
      title: "Disease-conducive humidity",
      body: "Warm, humid conditions can favor several foliar diseases. Prioritize scouting in susceptible crops and dense canopies.",
    });
  }

  if (!advisories.length) {
    advisories.push({
      level: "INFO",
      title: "No major weather constraint detected",
      body: "The current seven-day forecast does not cross FarmHQ advisory thresholds. Continue routine monitoring before field work.",
    });
  }

  return advisories;
}
