import type {
  AppLanguage,
  DashboardLocation,
} from "#lib/app-settings.js";
import {
  readPersistentCache,
  writePersistentCache,
  type PersistentCacheEntry,
} from "#lib/persistent-cache.js";

const RETRY_DELAYS = [0, 1_500, 4_000];
const REQUEST_TIMEOUT = 8_000;
const WEATHER_CACHE_MAX_AGE = 14 * 60 * 1000;
export const WEATHER_REFRESH_INTERVAL = 15 * 60 * 1000;

const weatherCache = new Map<string, PersistentCacheEntry<OpenMeteoResponse>>();
const weatherRequests = new Map<
  string,
  Promise<PersistentCacheEntry<OpenMeteoResponse>>
>();

export type WeatherKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

export type CurrentWeather = {
  temperature: number;
  unit: string;
  code: number;
  isDay: boolean;
  description: string;
  kind: WeatherKind;
};

export type HourlyWeather = CurrentWeather & {
  time: string;
  precipitationProbability: number;
  windSpeed: number;
  windUnit: string;
};

export type WeatherSnapshot = {
  current: CurrentWeather;
  hourly: HourlyWeather[];
};

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  current_units?: {
    temperature_2m?: string;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: Array<number | null>;
    wind_speed_10m?: number[];
    weather_code?: number[];
    is_day?: number[];
  };
  hourly_units?: {
    temperature_2m?: string;
    wind_speed_10m?: string;
  };
};

function weatherDetails(
  code: number,
  language: AppLanguage,
): Pick<CurrentWeather, "description" | "kind"> {
  const descriptions =
    language === "nl"
      ? {
          clear: "Helder",
          partlyCloudy: "Gedeeltelijk bewolkt",
          cloudy: "Bewolkt",
          fog: "Mist",
          rain: "Regen",
          snow: "Sneeuw",
          rainShowers: "Regenbuien",
          snowShowers: "Sneeuwbuien",
          storm: "Onweer",
          current: "Huidig weer",
        }
      : {
          clear: "Clear",
          partlyCloudy: "Partly cloudy",
          cloudy: "Overcast",
          fog: "Foggy",
          rain: "Rain",
          snow: "Snow",
          rainShowers: "Rain showers",
          snowShowers: "Snow showers",
          storm: "Thunderstorm",
          current: "Current weather",
        };

  if (code === 0) return { description: descriptions.clear, kind: "clear" };
  if (code <= 2) return { description: descriptions.partlyCloudy, kind: "partly-cloudy" };
  if (code === 3) return { description: descriptions.cloudy, kind: "cloudy" };
  if (code === 45 || code === 48) return { description: descriptions.fog, kind: "fog" };
  if (code >= 51 && code <= 67) return { description: descriptions.rain, kind: "rain" };
  if (code >= 71 && code <= 77) return { description: descriptions.snow, kind: "snow" };
  if (code >= 80 && code <= 82) return { description: descriptions.rainShowers, kind: "rain" };
  if (code >= 85 && code <= 86) return { description: descriptions.snowShowers, kind: "snow" };
  if (code >= 95) return { description: descriptions.storm, kind: "storm" };

  return { description: descriptions.current, kind: "cloudy" };
}

function abortError() {
  return new DOMException("The weather request was cancelled", "AbortError");
}

function wait(delay: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delay));
}

function weatherUrl(location: DashboardLocation) {
  const parameters = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "temperature_2m,weather_code,is_day",
    hourly:
      "temperature_2m,precipitation_probability,wind_speed_10m,weather_code,is_day",
    temperature_unit: "celsius",
    timezone: location.timezone,
    forecast_hours: "12",
  });

  return `https://api.open-meteo.com/v1/forecast?${parameters}`;
}

async function fetchWeather(
  location: DashboardLocation,
) {
  const requestController = new AbortController();
  const timeout = window.setTimeout(
    () => requestController.abort(new DOMException("Weather request timed out", "TimeoutError")),
    REQUEST_TIMEOUT,
  );

  try {
    return await fetch(weatherUrl(location), {
      signal: requestController.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseWeather(
  data: OpenMeteoResponse,
  language: AppLanguage,
): CurrentWeather {
  const temperature = data.current?.temperature_2m;
  const code = data.current?.weather_code;
  const isDay = data.current?.is_day;

  if (
    typeof temperature !== "number" ||
    typeof code !== "number" ||
    typeof isDay !== "number"
  ) {
    throw new Error("Open-Meteo returned an unexpected response");
  }

  return {
    temperature,
    unit: data.current_units?.temperature_2m ?? "°C",
    code,
    isDay: isDay === 1,
    ...weatherDetails(code, language),
  };
}

function parseHourlyWeather(
  data: OpenMeteoResponse,
  language: AppLanguage,
): HourlyWeather[] {
  const times = data.hourly?.time;
  const temperatures = data.hourly?.temperature_2m;
  const precipitation = data.hourly?.precipitation_probability;
  const windSpeeds = data.hourly?.wind_speed_10m;
  const codes = data.hourly?.weather_code;
  const daylight = data.hourly?.is_day;

  if (
    !times ||
    !temperatures ||
    !precipitation ||
    !windSpeeds ||
    !codes ||
    !daylight
  ) {
    throw new Error("Open-Meteo returned an unexpected hourly response");
  }

  return times.map((time, index) => {
    const temperature = temperatures[index];
    const windSpeed = windSpeeds[index];
    const code = codes[index];
    const isDay = daylight[index];

    if (
      typeof temperature !== "number" ||
      typeof windSpeed !== "number" ||
      typeof code !== "number" ||
      typeof isDay !== "number"
    ) {
      throw new Error("Open-Meteo returned incomplete hourly weather data");
    }

    return {
      time,
      temperature,
      unit: data.hourly_units?.temperature_2m ?? "°C",
      code,
      isDay: isDay === 1,
      precipitationProbability: precipitation[index] ?? 0,
      windSpeed,
      windUnit: data.hourly_units?.wind_speed_10m ?? "km/h",
      ...weatherDetails(code, language),
    };
  });
}

async function requestOpenMeteoData(
  location: DashboardLocation,
): Promise<OpenMeteoResponse> {
  let lastError: unknown;

  for (const delay of RETRY_DELAYS) {
    await wait(delay);

    try {
      const response = await fetchWeather(location);

      if (response.ok) {
        return (await response.json()) as OpenMeteoResponse;
      }

      const error = new Error(`Open-Meteo request failed with status ${response.status}`);

      if (response.status < 500 && response.status !== 429) {
        throw error;
      }

      lastError = error;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Open-Meteo request failed");
}

function weatherCacheKey(location: DashboardLocation) {
  return `weather:v2:${location.latitude}:${location.longitude}:${location.timezone}`;
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;

  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function getOpenMeteoData(
  location: DashboardLocation,
  signal?: AbortSignal,
): Promise<OpenMeteoResponse> {
  const key = weatherCacheKey(location);
  let cached = weatherCache.get(key);

  if (!cached) {
    cached = (await readPersistentCache<OpenMeteoResponse>(key)) ?? undefined;
    if (cached) weatherCache.set(key, cached);
  }

  if (cached && Date.now() - cached.updatedAt < WEATHER_CACHE_MAX_AGE) {
    return cached.value;
  }

  let request = weatherRequests.get(key);

  if (!request) {
    request = requestOpenMeteoData(location)
      .then(async (value) => {
        const entry = { value, updatedAt: Date.now() };
        weatherCache.set(key, entry);
        await writePersistentCache(key, entry);
        return entry;
      })
      .catch((error) => {
        if (cached) return cached;
        throw error;
      })
      .finally(() => weatherRequests.delete(key));
    weatherRequests.set(key, request);
  }

  return withAbort(request.then((entry) => entry.value), signal);
}

export async function getCurrentWeather(
  location: DashboardLocation,
  language: AppLanguage,
  signal?: AbortSignal,
): Promise<CurrentWeather> {
  return parseWeather(await getOpenMeteoData(location, signal), language);
}

export async function getHourlyForecast(
  location: DashboardLocation,
  language: AppLanguage,
  signal?: AbortSignal,
): Promise<HourlyWeather[]> {
  return parseHourlyWeather(
    await getOpenMeteoData(location, signal),
    language,
  );
}

export async function getWeatherSnapshot(
  location: DashboardLocation,
  language: AppLanguage,
  signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  const data = await getOpenMeteoData(location, signal);

  return {
    current: parseWeather(data, language),
    hourly: parseHourlyWeather(data, language),
  };
}
