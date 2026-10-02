export type FarmWeather = {
  current: {
    time: string;
    temperature: number;
    humidity: number;
    precipitation: number;
    windSpeed: number;
    weatherCode: number;
  };
  daily: {
    date: string;
    max: number;
    min: number;
    precipitation: number;
    precipitationProbability: number;
    wind: number;
    weatherCode: number;
  }[];
};

export function weatherLabel(code: number) {
  if (code === 0) return "Clear";
  if ([1,2].includes(code)) return "Mostly clear";
  if (code === 3) return "Overcast";
  if ([45,48].includes(code)) return "Fog";
  if ([51,53,55,56,57].includes(code)) return "Drizzle";
  if ([61,63,65,66,67,80,81,82].includes(code)) return "Rain";
  if ([71,73,75,77,85,86].includes(code)) return "Snow";
  if ([95,96,99].includes(code)) return "Thunderstorm";
  return "Variable";
}

export async function getFarmWeather(latitude: number, longitude: number): Promise<FarmWeather> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "7",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 1800 } });
  if (!response.ok) throw new Error("Weather provider unavailable");
  const data = await response.json();
  return {
    current: {
      time: data.current.time,
      temperature: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      precipitation: data.current.precipitation,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
    },
    daily: data.daily.time.map((date: string, index: number) => ({
      date,
      max: data.daily.temperature_2m_max[index],
      min: data.daily.temperature_2m_min[index],
      precipitation: data.daily.precipitation_sum[index],
      precipitationProbability: data.daily.precipitation_probability_max[index],
      wind: data.daily.wind_speed_10m_max[index],
      weatherCode: data.daily.weather_code[index],
    })),
  };
}
