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
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  cloudCover: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  unit: string;
  precipitationUnit: string;
  pressureUnit: string;
  windUnit: string;
  code: number;
  isDay: boolean;
  description: string;
  kind: WeatherKind;
};

export type HourlyWeather = CurrentWeather & {
  time: string;
  precipitationProbability: number;
  dewPoint: number;
  cloudCoverLow: number;
  cloudCoverMid: number;
  cloudCoverHigh: number;
  visibility: number;
  uvIndex: number;
};

export type DailyWeather = {
  time: string;
  temperatureMax: number;
  temperatureMin: number;
  apparentTemperatureMax: number;
  apparentTemperatureMin: number;
  precipitationProbabilityMax: number;
  precipitationSum: number;
  windSpeedMax: number;
  windGustsMax: number;
  windDirection: number;
  uvIndexMax: number;
  sunrise: string;
  sunset: string;
  moonrise: string | null;
  moonset: string | null;
  moonPhase: number;
  code: number;
  description: string;
  kind: WeatherKind;
};

export type WeatherSnapshot = {
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  updatedAt: number;
};

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    is_day?: number;
    cloud_cover?: number;
    pressure_msl?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
  };
  current_units?: {
    temperature_2m?: string;
    precipitation?: string;
    pressure_msl?: string;
    wind_speed_10m?: string;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    relative_humidity_2m?: number[];
    dew_point_2m?: number[];
    precipitation?: number[];
    precipitation_probability?: Array<number | null>;
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wind_gusts_10m?: number[];
    pressure_msl?: number[];
    cloud_cover?: number[];
    cloud_cover_low?: number[];
    cloud_cover_mid?: number[];
    cloud_cover_high?: number[];
    visibility?: number[];
    uv_index?: number[];
    weather_code?: number[];
    is_day?: number[];
  };
  hourly_units?: {
    temperature_2m?: string;
    precipitation?: string;
    wind_speed_10m?: string;
    pressure_msl?: string;
    visibility?: string;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    apparent_temperature_max?: number[];
    apparent_temperature_min?: number[];
    precipitation_probability_max?: Array<number | null>;
    precipitation_sum?: number[];
    weather_code?: number[];
    sunrise?: string[];
    sunset?: string[];
    moonrise?: Array<string | null>;
    moonset?: Array<string | null>;
    moon_phase?: number[];
    uv_index_max?: number[];
    wind_speed_10m_max?: number[];
    wind_gusts_10m_max?: number[];
    wind_direction_10m_dominant?: number[];
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
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly:
      "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,uv_index,weather_code,is_day",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,moonrise,moonset,moon_phase,uv_index_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
    temperature_unit: "celsius",
    timezone: location.timezone,
    forecast_days: "7",
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
  const apparentTemperature = data.current?.apparent_temperature;
  const humidity = data.current?.relative_humidity_2m;
  const precipitation = data.current?.precipitation;
  const code = data.current?.weather_code;
  const isDay = data.current?.is_day;
  const cloudCover = data.current?.cloud_cover;
  const pressure = data.current?.pressure_msl;
  const windSpeed = data.current?.wind_speed_10m;
  const windDirection = data.current?.wind_direction_10m;
  const windGusts = data.current?.wind_gusts_10m;

  if (
    typeof temperature !== "number" ||
    typeof apparentTemperature !== "number" ||
    typeof humidity !== "number" ||
    typeof precipitation !== "number" ||
    typeof code !== "number" ||
    typeof isDay !== "number" ||
    typeof cloudCover !== "number" ||
    typeof pressure !== "number" ||
    typeof windSpeed !== "number" ||
    typeof windDirection !== "number" ||
    typeof windGusts !== "number"
  ) {
    throw new Error("Open-Meteo returned an unexpected response");
  }

  return {
    temperature,
    apparentTemperature,
    humidity,
    precipitation,
    cloudCover,
    pressure,
    windSpeed,
    windDirection,
    windGusts,
    unit: data.current_units?.temperature_2m ?? "°C",
    precipitationUnit: data.current_units?.precipitation ?? "mm",
    pressureUnit: data.current_units?.pressure_msl ?? "hPa",
    windUnit: data.current_units?.wind_speed_10m ?? "km/h",
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
  const apparentTemperatures = data.hourly?.apparent_temperature;
  const humidity = data.hourly?.relative_humidity_2m;
  const dewPoints = data.hourly?.dew_point_2m;
  const precipitationAmount = data.hourly?.precipitation;
  const precipitation = data.hourly?.precipitation_probability;
  const windSpeeds = data.hourly?.wind_speed_10m;
  const windDirections = data.hourly?.wind_direction_10m;
  const windGusts = data.hourly?.wind_gusts_10m;
  const pressure = data.hourly?.pressure_msl;
  const cloudCover = data.hourly?.cloud_cover;
  const cloudCoverLow = data.hourly?.cloud_cover_low;
  const cloudCoverMid = data.hourly?.cloud_cover_mid;
  const cloudCoverHigh = data.hourly?.cloud_cover_high;
  const visibility = data.hourly?.visibility;
  const uvIndex = data.hourly?.uv_index;
  const codes = data.hourly?.weather_code;
  const daylight = data.hourly?.is_day;

  if (
    !times ||
    !temperatures ||
    !apparentTemperatures ||
    !humidity ||
    !dewPoints ||
    !precipitationAmount ||
    !precipitation ||
    !windSpeeds ||
    !windDirections ||
    !windGusts ||
    !pressure ||
    !cloudCover ||
    !cloudCoverLow ||
    !cloudCoverMid ||
    !cloudCoverHigh ||
    !visibility ||
    !uvIndex ||
    !codes ||
    !daylight
  ) {
    throw new Error("Open-Meteo returned an unexpected hourly response");
  }

  return times.map((time, index) => {
    const temperature = temperatures[index];
    const apparentTemperature = apparentTemperatures[index];
    const relativeHumidity = humidity[index];
    const dewPoint = dewPoints[index];
    const precipitationValue = precipitationAmount[index];
    const windSpeed = windSpeeds[index];
    const windDirection = windDirections[index];
    const gusts = windGusts[index];
    const pressureValue = pressure[index];
    const cloudCoverValue = cloudCover[index];
    const lowClouds = cloudCoverLow[index];
    const midClouds = cloudCoverMid[index];
    const highClouds = cloudCoverHigh[index];
    const visibilityValue = visibility[index];
    const uvIndexValue = uvIndex[index];
    const code = codes[index];
    const isDay = daylight[index];

    if (
      typeof temperature !== "number" ||
      typeof apparentTemperature !== "number" ||
      typeof relativeHumidity !== "number" ||
      typeof dewPoint !== "number" ||
      typeof precipitationValue !== "number" ||
      typeof windSpeed !== "number" ||
      typeof windDirection !== "number" ||
      typeof gusts !== "number" ||
      typeof pressureValue !== "number" ||
      typeof cloudCoverValue !== "number" ||
      typeof lowClouds !== "number" ||
      typeof midClouds !== "number" ||
      typeof highClouds !== "number" ||
      typeof visibilityValue !== "number" ||
      typeof uvIndexValue !== "number" ||
      typeof code !== "number" ||
      typeof isDay !== "number"
    ) {
      throw new Error("Open-Meteo returned incomplete hourly weather data");
    }

    return {
      time,
      temperature,
      apparentTemperature,
      humidity: relativeHumidity,
      dewPoint,
      precipitation: precipitationValue,
      precipitationUnit: data.hourly_units?.precipitation ?? "mm",
      cloudCover: cloudCoverValue,
      cloudCoverLow: lowClouds,
      cloudCoverMid: midClouds,
      cloudCoverHigh: highClouds,
      visibility: visibilityValue,
      uvIndex: uvIndexValue,
      pressure: pressureValue,
      pressureUnit: data.hourly_units?.pressure_msl ?? "hPa",
      unit: data.hourly_units?.temperature_2m ?? "°C",
      code,
      isDay: isDay === 1,
      precipitationProbability: precipitation[index] ?? 0,
      windSpeed,
      windDirection,
      windGusts: gusts,
      windUnit: data.hourly_units?.wind_speed_10m ?? "km/h",
      ...weatherDetails(code, language),
    };
  });
}

function parseDailyWeather(
  data: OpenMeteoResponse,
  language: AppLanguage,
): DailyWeather[] {
  const daily = data.daily;
  const required = [
    daily?.time,
    daily?.temperature_2m_max,
    daily?.temperature_2m_min,
    daily?.apparent_temperature_max,
    daily?.apparent_temperature_min,
    daily?.precipitation_probability_max,
    daily?.precipitation_sum,
    daily?.weather_code,
    daily?.sunrise,
    daily?.sunset,
    daily?.moon_phase,
    daily?.uv_index_max,
    daily?.wind_speed_10m_max,
    daily?.wind_gusts_10m_max,
    daily?.wind_direction_10m_dominant,
  ];

  if (required.some((value) => !value)) {
    throw new Error("Open-Meteo returned an unexpected daily response");
  }

  return daily!.time!.map((time, index) => {
    const code = daily!.weather_code![index];
    if (typeof code !== "number") {
      throw new Error("Open-Meteo returned incomplete daily weather data");
    }

    return {
      time,
      temperatureMax: daily!.temperature_2m_max![index],
      temperatureMin: daily!.temperature_2m_min![index],
      apparentTemperatureMax: daily!.apparent_temperature_max![index],
      apparentTemperatureMin: daily!.apparent_temperature_min![index],
      precipitationProbabilityMax:
        daily!.precipitation_probability_max![index] ?? 0,
      precipitationSum: daily!.precipitation_sum![index],
      windSpeedMax: daily!.wind_speed_10m_max![index],
      windGustsMax: daily!.wind_gusts_10m_max![index],
      windDirection: daily!.wind_direction_10m_dominant![index],
      uvIndexMax: daily!.uv_index_max![index],
      sunrise: daily!.sunrise![index],
      sunset: daily!.sunset![index],
      moonrise: daily!.moonrise?.[index] ?? null,
      moonset: daily!.moonset?.[index] ?? null,
      moonPhase: daily!.moon_phase![index],
      code,
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
  return `weather:v3:${location.latitude}:${location.longitude}:${location.timezone}`;
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
    daily: parseDailyWeather(data, language),
    updatedAt: Date.now(),
  };
}
