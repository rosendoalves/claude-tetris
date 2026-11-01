#!/usr/bin/env node
// Prints current weather and today's forecast as JSON. Requires Node 18+.
// Usage: weather.mjs [--city "<name>"] | [--lat=<lat> --lon=<lon> [--name "<label>"]]
import { parseArgs } from "node:util";

const DEFAULT_LOCATION = {
  name: "San Miguel de Tucumán, Tucumán, Argentina",
  latitude: -26.8241,
  longitude: -65.2226,
};
const TIMEOUT_MS = 15000;

const CONDITIONS = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snowfall",
  73: "moderate snowfall",
  75: "heavy snowfall",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail",
};

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url.hostname} responded with HTTP ${response.status}`);
  return response.json();
}

async function geocode(city) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: city, count: "1", language: "es" });
  const { results } = await fetchJson(url);
  if (!results?.length) throw new Error(`No location found for "${city}"`);
  const [{ name, admin1, country, latitude, longitude }] = results;
  return {
    name: [name, admin1, country].filter(Boolean).join(", "),
    latitude,
    longitude,
  };
}

function parseCoordinate(value, flag, limit) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || Math.abs(coordinate) > limit) {
    throw new Error(`Invalid ${flag}: ${value}`);
  }
  return coordinate;
}

async function resolveLocation({ city, lat, lon, name }) {
  if (city !== undefined && (lat !== undefined || lon !== undefined)) {
    throw new Error("Use either --city or --lat/--lon, not both");
  }
  if (city !== undefined) return geocode(city);
  if (lat === undefined && lon === undefined) return DEFAULT_LOCATION;
  if (lat === undefined || lon === undefined) throw new Error("--lat and --lon must be used together");
  return {
    name: name ?? `${lat}, ${lon}`,
    latitude: parseCoordinate(lat, "--lat", 90),
    longitude: parseCoordinate(lon, "--lon", 180),
  };
}

async function fetchWeather({ name, latitude, longitude }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude,
    longitude,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    timezone: "auto",
    forecast_days: "1",
  });
  const { current, daily, timezone } = await fetchJson(url);
  return {
    location: name,
    timezone,
    observedAt: current.time,
    current: {
      temperatureC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidityPct: current.relative_humidity_2m,
      windKmh: current.wind_speed_10m,
      condition: CONDITIONS[current.weather_code] ?? `unknown (code ${current.weather_code})`,
    },
    today: {
      minC: daily.temperature_2m_min[0],
      maxC: daily.temperature_2m_max[0],
      rainChancePct: daily.precipitation_probability_max[0],
      condition: CONDITIONS[daily.weather_code[0]] ?? `unknown (code ${daily.weather_code[0]})`,
    },
    source: "Open-Meteo",
  };
}

try {
  const { values } = parseArgs({
    options: {
      city: { type: "string" },
      lat: { type: "string" },
      lon: { type: "string" },
      name: { type: "string" },
    },
  });
  const weather = await fetchWeather(await resolveLocation(values));
  console.log(JSON.stringify(weather, null, 2));
} catch (error) {
  console.error(`weather: ${error.message}`);
  process.exit(1);
}
