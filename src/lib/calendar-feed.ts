export function normalizeCalendarUrl(value: string) {
  const normalized = value.trim().replace(/^webcals?:\/\//i, "https://");
  const url = new URL(normalized);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Invalid calendar URL");
  }

  return url.toString();
}

export async function fetchCalendarFeed(value: string) {
  const url = normalizeCalendarUrl(value);
  const cacheKey = `calendar:${url}`;
  let cached = calendarCache.get(cacheKey);

  if (!cached) {
    cached =
      (await readPersistentCache<CalendarFeedData>(cacheKey)) ?? undefined;
    if (cached) calendarCache.set(cacheKey, cached);
  }

  if (cached && Date.now() - cached.updatedAt < CALENDAR_REFRESH_INTERVAL) {
    return cached.value;
  }

  let request = calendarRequests.get(cacheKey);

  if (!request) {
    request = requestCalendarFeed(url)
      .then(async (feed) => {
        const entry = { value: feed, updatedAt: Date.now() };
        calendarCache.set(cacheKey, entry);
        await writePersistentCache(cacheKey, entry);
        return entry;
      })
      .catch((error) => {
        if (cached) return cached;
        throw error;
      })
      .finally(() => calendarRequests.delete(cacheKey));
    calendarRequests.set(cacheKey, request);
  }

  return (await request).value;
}

async function requestCalendarFeed(url: string): Promise<CalendarFeedData> {
  const proxyUrl = new URL(
    import.meta.env.VITE_CALENDAR_PROXY_URL || "/api/apple-calendar",
    window.location.origin,
  );
  proxyUrl.searchParams.set("url", url);

  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error(`Calendar request failed with status ${response.status}`);
  }

  const calendarData = await response.text();

  if (!calendarData.includes("BEGIN:VCALENDAR")) {
    throw new Error("The shared URL did not return an iCalendar feed");
  }

  return { url, calendarData };
}
import {
  readPersistentCache,
  writePersistentCache,
  type PersistentCacheEntry,
} from "#lib/persistent-cache.js";

export const CALENDAR_REFRESH_INTERVAL = 30 * 60 * 1000;

type CalendarFeedData = {
  url: string;
  calendarData: string;
};

const calendarCache = new Map<
  string,
  PersistentCacheEntry<CalendarFeedData>
>();
const calendarRequests = new Map<
  string,
  Promise<PersistentCacheEntry<CalendarFeedData>>
>();
