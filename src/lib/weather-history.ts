export type WeatherHistoryDay = {
  date: string;
  max: number | null;
  min: number | null;
  precipitation: number | null;
  et0: number | null;
};

export type WeatherHistory = {
  daily: WeatherHistoryDay[];
  totalRainfall: number;
  rainyDays: number;
  meanMaxTemperature: number | null;
  totalEt0: number;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function defaultHistoryRange(days = 30) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: isoDate(start), end: isoDate(end) };
}

export async function getWeatherHistory(latitude: number, longitude: number, startDate: string, endDate: string): Promise<WeatherHistory> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: startDate,
    end_date: endDate,
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration",
    timezone: "auto",
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, { next: { revalidate: 21600 } });
  if (!response.ok) throw new Error("Historical weather provider unavailable");
  const data = await response.json();
  const daily: WeatherHistoryDay[] = (data.daily?.time || []).map((date: string, index: number) => ({
    date,
    max: data.daily.temperature_2m_max?.[index] ?? null,
    min: data.daily.temperature_2m_min?.[index] ?? null,
    precipitation: data.daily.precipitation_sum?.[index] ?? null,
    et0: data.daily.et0_fao_evapotranspiration?.[index] ?? null,
  }));
  const rainfall = daily.map((day) => day.precipitation || 0);
  const maxTemps = daily.map((day) => day.max).filter((value): value is number => value != null);
  return {
    daily,
    totalRainfall: rainfall.reduce((sum, value) => sum + value, 0),
    rainyDays: rainfall.filter((value) => value >= 1).length,
    meanMaxTemperature: maxTemps.length ? maxTemps.reduce((sum, value) => sum + value, 0) / maxTemps.length : null,
    totalEt0: daily.reduce((sum, day) => sum + (day.et0 || 0), 0),
  };
}
