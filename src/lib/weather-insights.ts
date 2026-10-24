import type { HourlyWeather } from "#lib/weather.js";

export type PrecipitationStatus = "dry" | "uncertain" | "wet";

export type WeatherPeriod = {
  status: PrecipitationStatus;
  start: string;
  end: string;
  hours: HourlyWeather[];
};

export type SkyCondition = {
  hour: HourlyWeather;
  score: number;
};

export function precipitationStatus(hour: HourlyWeather): PrecipitationStatus {
  if (hour.precipitation >= 0.1 || hour.precipitationProbability >= 60) {
    return "wet";
  }
  if (hour.precipitationProbability >= 30) return "uncertain";
  return "dry";
}

function followingHour(time: string) {
  const [date, clock] = time.split("T");
  const [hours] = clock.split(":").map(Number);
  if (hours < 23) return `${date}T${String(hours + 1).padStart(2, "0")}:00`;

  const nextDate = new Date(`${date}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return `${nextDate.toISOString().slice(0, 10)}T00:00`;
}

export function groupWeatherPeriods(hours: HourlyWeather[]): WeatherPeriod[] {
  const periods: WeatherPeriod[] = [];

  for (const hour of hours) {
    const status = precipitationStatus(hour);
    const current = periods.at(-1);

    if (!current || current.status !== status) {
      periods.push({
        status,
        start: hour.time,
        end: followingHour(hour.time),
        hours: [hour],
      });
      continue;
    }

    current.hours.push(hour);
    current.end = followingHour(hour.time);
  }

  return periods;
}

export function findCurrentHourIndex(
  hours: HourlyWeather[],
  now: Date,
  timeZone: string,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const key = `${value.year}-${value.month}-${value.day}T${value.hour}:00`;
  const index = hours.findIndex((hour) => hour.time === key);
  return Math.max(index, 0);
}

export function getTodayHours(
  hours: HourlyWeather[],
  now: Date,
  timeZone: string,
) {
  const start = findCurrentHourIndex(hours, now, timeZone);
  const date = hours[start]?.time.slice(0, 10);
  return hours.slice(start).filter((hour) => hour.time.startsWith(`${date}T`));
}

export function getUpcomingNight(
  hours: HourlyWeather[],
  now: Date,
  timeZone: string,
) {
  const current = findCurrentHourIndex(hours, now, timeZone);
  let start = current;

  if (hours[start]?.isDay) {
    start = hours.findIndex((hour, index) => index >= current && !hour.isDay);
  }
  if (start < 0) return [];

  const night: HourlyWeather[] = [];
  for (const hour of hours.slice(start)) {
    if (night.length > 0 && hour.isDay) break;
    if (!hour.isDay) night.push(hour);
  }
  return night;
}

export function skyScore(hour: HourlyWeather) {
  const cloudPenalty = hour.cloudCover * 0.55 + hour.cloudCoverHigh * 0.1;
  const rainPenalty = hour.precipitationProbability * 0.15;
  const visibilityKm = hour.visibility / 1_000;
  const visibilityPenalty = Math.max(0, 20 - visibilityKm) * 1.25;
  const dewSpread = hour.temperature - hour.dewPoint;
  const dewPenalty = Math.max(0, 3 - dewSpread) * 4;
  const windPenalty = Math.max(0, hour.windGusts - 20) * 0.35;

  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        100 - cloudPenalty - rainPenalty - visibilityPenalty - dewPenalty - windPenalty,
      ),
    ),
  );
}

export function getSkyConditions(hours: HourlyWeather[]): SkyCondition[] {
  return hours.map((hour) => ({ hour, score: skyScore(hour) }));
}

export function bestSkyWindow(conditions: SkyCondition[]) {
  let best: SkyCondition[] = [];
  let current: SkyCondition[] = [];

  for (const condition of conditions) {
    if (condition.score >= 55) {
      current.push(condition);
      if (
        current.length > best.length ||
        (current.length === best.length &&
          averageScore(current) > averageScore(best))
      ) {
        best = [...current];
      }
    } else {
      current = [];
    }
  }

  if (best.length > 0) return best;
  const fallback = [...conditions].sort((a, b) => b.score - a.score)[0];
  return fallback ? [fallback] : [];
}

export function bestWalkPeriod(periods: WeatherPeriod[]) {
  const candidates = periods.filter((period) => period.status !== "wet");
  return candidates.sort((first, second) => {
    if (first.status !== second.status) return first.status === "dry" ? -1 : 1;
    const duration = second.hours.length - first.hours.length;
    if (duration !== 0) return duration;
    const firstGust = Math.max(...first.hours.map((hour) => hour.windGusts));
    const secondGust = Math.max(...second.hours.map((hour) => hour.windGusts));
    return firstGust - secondGust;
  })[0];
}

function averageScore(conditions: SkyCondition[]) {
  if (conditions.length === 0) return 0;
  return conditions.reduce((sum, condition) => sum + condition.score, 0) / conditions.length;
}
