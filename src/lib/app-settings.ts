import { writable } from "svelte/store";

export type AppLanguage = "nl" | "en";
export type ColorModePreference = "auto" | "light" | "dark";

export type CalendarFeed = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

export type HouseholdProfile = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  family: boolean;
  calendars: CalendarFeed[];
};

export type DashboardLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type AppSettings = {
  profiles: HouseholdProfile[];
  location: DashboardLocation;
  language: AppLanguage;
  colorMode: ColorModePreference;
};

const SETTINGS_STORAGE_KEY = "minimalist-home:settings";
const LEGACY_CALENDAR_STORAGE_KEY = "minimalist-home:apple-calendar-url";
const isBrowser = typeof window !== "undefined";

export const defaultSettings: AppSettings = {
  profiles: [
    {
      id: "family",
      name: "Family",
      avatar: "F",
      color: "#e11d48",
      family: true,
      calendars: [],
    },
    {
      id: "nicky",
      name: "Nicky",
      avatar: "N",
      color: "#2563eb",
      family: false,
      calendars: [],
    },
    {
      id: "noor",
      name: "Noor",
      avatar: "N",
      color: "#7c3aed",
      family: false,
      calendars: [],
    },
  ],
  location: {
    name: "Goirle",
    latitude: 51.5237,
    longitude: 5.0642,
    timezone: "Europe/Amsterdam",
  },
  language: "nl",
  colorMode: "auto",
};

type LegacyAppSettings = Partial<AppSettings> & {
  calendars?: Array<CalendarFeed & { color?: string }>;
  profiles?: Array<Partial<HouseholdProfile> & Pick<HouseholdProfile, "id" | "name">>;
};

function normalizeCalendar(calendar: CalendarFeed & { color?: string }): CalendarFeed {
  return {
    id: calendar.id,
    name: calendar.name,
    url: calendar.url,
    enabled: calendar.enabled !== false,
  };
}

function normalizeProfiles(
  profiles: LegacyAppSettings["profiles"],
  legacyCalendars: LegacyAppSettings["calendars"] = [],
) {
  const sourceProfiles = Array.isArray(profiles)
    ? profiles
    : structuredClone(defaultSettings.profiles);
  const normalized = sourceProfiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar ?? profile.name.slice(0, 1).toUpperCase(),
    color: profile.color ?? "#64748b",
    family: profile.id === "family" || profile.family === true,
    calendars: Array.isArray(profile.calendars)
      ? profile.calendars.map(normalizeCalendar)
      : [],
  }));
  let family = normalized.find((profile) => profile.id === "family");

  if (!family) {
    family = structuredClone(defaultSettings.profiles[0]);
    normalized.unshift(family);
  }

  if (legacyCalendars.length > 0) {
    const existingIds = new Set(family.calendars.map((calendar) => calendar.id));
    family.calendars.push(
      ...legacyCalendars
        .filter((calendar) => !existingIds.has(calendar.id))
        .map(normalizeCalendar),
    );
  }

  return normalized;
}

function loadSettings(): AppSettings {
  if (!isBrowser) return structuredClone(defaultSettings);

  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (stored) {
      const parsed = JSON.parse(stored) as LegacyAppSettings;

      return {
        profiles: normalizeProfiles(parsed.profiles, parsed.calendars),
        location: parsed.location ?? defaultSettings.location,
        language: parsed.language === "en" ? "en" : "nl",
        colorMode:
          parsed.colorMode === "light" || parsed.colorMode === "dark"
            ? parsed.colorMode
            : "auto",
      };
    }

    const legacyCalendar = window.localStorage.getItem(
      LEGACY_CALENDAR_STORAGE_KEY,
    );

    if (legacyCalendar) {
      const settings = structuredClone(defaultSettings);
      settings.profiles[0].calendars.push({
        id: "family-calendar",
        name: "Family",
        url: legacyCalendar,
        enabled: true,
      });
      return settings;
    }
  } catch {
    // Invalid stored settings fall back to the known-good defaults.
  }

  return structuredClone(defaultSettings);
}

export const appSettings = writable<AppSettings>(loadSettings());
export const activeProfileId = writable("family");

if (isBrowser) {
  appSettings.subscribe((settings) => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.removeItem(LEGACY_CALENDAR_STORAGE_KEY);
  });
}
