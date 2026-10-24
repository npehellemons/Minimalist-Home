import ICAL from "ical.js";
import { Temporal } from "temporal-polyfill";

import type { HouseholdProfile } from "#lib/app-settings.js";
import { fetchCalendarFeed } from "#lib/calendar-feed.js";

export type HouseholdCalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  profileId: string;
  profileName: string;
  profileColor: string;
  calendarName: string;
  location: string;
};

type ParsedEventCacheEntry = {
  calendarData: string;
  profileName: string;
  profileColor: string;
  calendarName: string;
  timeZone: string;
  rangeStart: number;
  rangeEnd: number;
  events: HouseholdCalendarEvent[];
};

const MAX_CACHED_RANGES_PER_FEED = 8;
const parsedEventCache = new Map<string, ParsedEventCacheEntry[]>();

function calendarTimeToDate(time: ICAL.Time, fallbackTimeZone: string) {
  if (time.isDate || time.zone.tzid === "floating") {
    return new Date(
      Temporal.ZonedDateTime.from({
        timeZone: fallbackTimeZone,
        year: time.year,
        month: time.month,
        day: time.day,
        hour: time.isDate ? 0 : time.hour,
        minute: time.isDate ? 0 : time.minute,
        second: time.isDate ? 0 : time.second,
      }).epochMilliseconds,
    );
  }

  return time.toJSDate();
}

function isCancelled(event: ICAL.Event) {
  return (
    String(event.component.getFirstPropertyValue("status") ?? "").toUpperCase() ===
    "CANCELLED"
  );
}

function registerTimeZones(calendar: ICAL.Component) {
  for (const component of calendar.getAllSubcomponents("vtimezone")) {
    const tzid = component.getFirstPropertyValue("tzid");
    if (typeof tzid !== "string" || ICAL.TimezoneService.has(tzid)) continue;

    ICAL.TimezoneService.register(new ICAL.Timezone({ component, tzid }));
  }
}

function eventInstance(
  event: ICAL.Event,
  occurrenceStart: ICAL.Time,
  occurrenceEnd: ICAL.Time,
  profile: HouseholdProfile,
  calendarId: string,
  calendarName: string,
  timeZone: string,
): HouseholdCalendarEvent {
  const start = calendarTimeToDate(occurrenceStart, timeZone);
  const end = calendarTimeToDate(occurrenceEnd, timeZone);

  return {
    id: `${profile.id}:${calendarId}:${event.uid}:${start.toISOString()}`,
    title: event.summary || calendarName,
    start,
    end,
    allDay: occurrenceStart.isDate,
    profileId: profile.id,
    profileName: profile.name,
    profileColor: profile.color,
    calendarName,
    location: event.location || "",
  };
}

function eventOverlapsRange(
  event: HouseholdCalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
) {
  return event.end > rangeStart && event.start < rangeEnd;
}

function parseEvents(
  calendarData: string,
  profile: HouseholdProfile,
  calendarId: string,
  calendarName: string,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string,
) {
  const calendar = new ICAL.Component(ICAL.parse(calendarData));
  registerTimeZones(calendar);
  const events: HouseholdCalendarEvent[] = [];
  const sourceEvents = calendar
    .getAllSubcomponents("vevent")
    .map((component) => new ICAL.Event(component));
  const recurrenceExceptions = sourceEvents.filter((event) =>
    event.isRecurrenceException(),
  );
  const exceptionKeys = new Set(
    recurrenceExceptions.flatMap((event) =>
      event.recurrenceId
        ? [
            `${event.uid}\u0000${calendarTimeToDate(
              event.recurrenceId,
              timeZone,
            ).getTime()}`,
          ]
        : [],
    ),
  );

  for (const sourceEvent of sourceEvents) {
    if (sourceEvent.isRecurrenceException() || isCancelled(sourceEvent)) continue;

    if (!sourceEvent.isRecurring()) {
      const event = eventInstance(
        sourceEvent,
        sourceEvent.startDate,
        sourceEvent.endDate,
        profile,
        calendarId,
        calendarName,
        timeZone,
      );
      if (eventOverlapsRange(event, rangeStart, rangeEnd)) events.push(event);
      continue;
    }

    const iterator = sourceEvent.iterator();
    const excludedStarts = new Set(
      sourceEvent.component
        .getAllProperties("exdate")
        .flatMap((property) => property.getValues())
        .flatMap((excluded) =>
          excluded instanceof ICAL.Time
            ? [calendarTimeToDate(excluded, timeZone).getTime()]
            : [],
        ),
    );
    let occurrence = iterator.next();
    let iterations = 0;

    while (occurrence && iterations < 20_000) {
      iterations += 1;
      const details = sourceEvent.getOccurrenceDetails(occurrence);
      const occurrenceTime = calendarTimeToDate(
        details.startDate,
        timeZone,
      ).getTime();
      const exceptionKey = `${sourceEvent.uid}\u0000${occurrenceTime}`;
      const event = eventInstance(
        details.item,
        details.startDate,
        details.endDate,
        profile,
        calendarId,
        calendarName,
        timeZone,
      );

      if (event.start >= rangeEnd) break;
      if (
        !isCancelled(details.item) &&
        !excludedStarts.has(occurrenceTime) &&
        !exceptionKeys.has(exceptionKey) &&
        eventOverlapsRange(event, rangeStart, rangeEnd)
      ) {
        events.push(event);
      }
      occurrence = iterator.next();
    }
  }

  for (const exception of recurrenceExceptions) {
    if (isCancelled(exception)) continue;

    const event = eventInstance(
      exception,
      exception.startDate,
      exception.endDate,
      profile,
      calendarId,
      calendarName,
      timeZone,
    );
    if (eventOverlapsRange(event, rangeStart, rangeEnd)) events.push(event);
  }

  return events;
}

export async function getHouseholdCalendarEvents(
  profiles: HouseholdProfile[],
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string,
) {
  const feeds = profiles.flatMap((profile) =>
    profile.calendars
      .filter((calendar) => calendar.enabled && calendar.url.trim())
      .map((calendar) => ({ profile, calendar })),
  );
  const results = await Promise.allSettled(
    feeds.map(async ({ profile, calendar }) => {
      const { calendarData } = await fetchCalendarFeed(calendar.url);
      const cacheKey = `${profile.id}:${calendar.id}`;
      const cachedEntries = parsedEventCache.get(cacheKey) ?? [];
      const cached = cachedEntries.find(
        (entry) =>
          entry.calendarData === calendarData &&
          entry.profileName === profile.name &&
          entry.profileColor === profile.color &&
          entry.calendarName === calendar.name &&
          entry.timeZone === timeZone &&
          entry.rangeStart === rangeStart.getTime() &&
          entry.rangeEnd === rangeEnd.getTime(),
      );

      if (cached) {
        return cached.events;
      }

      const events = parseEvents(
        calendarData,
        profile,
        calendar.id,
        calendar.name,
        rangeStart,
        rangeEnd,
        timeZone,
      );
      const cacheEntry = {
        calendarData,
        profileName: profile.name,
        profileColor: profile.color,
        calendarName: calendar.name,
        timeZone,
        rangeStart: rangeStart.getTime(),
        rangeEnd: rangeEnd.getTime(),
        events,
      };
      parsedEventCache.set(
        cacheKey,
        [cacheEntry, ...cachedEntries]
          .filter(
            (entry) =>
              entry.calendarData === calendarData &&
              entry.profileName === profile.name &&
              entry.profileColor === profile.color &&
              entry.calendarName === calendar.name &&
              entry.timeZone === timeZone,
          )
          .slice(0, MAX_CACHED_RANGES_PER_FEED),
      );
      return events;
    }),
  );

  if (
    feeds.length > 0 &&
    results.every((result) => result.status === "rejected")
  ) {
    throw new Error("No calendar feed could be loaded");
  }

  return results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((first, second) => {
      if (first.allDay !== second.allDay) return first.allDay ? -1 : 1;
      return first.start.getTime() - second.start.getTime();
    });
}
