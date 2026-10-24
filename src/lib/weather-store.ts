import { getContext, setContext } from "svelte";
import { readable } from "svelte/store";
import {
  appSettings,
  type AppSettings,
} from "#lib/app-settings.js";
import {
  getWeatherSnapshot,
  WEATHER_REFRESH_INTERVAL,
  type CurrentWeather,
  type DailyWeather,
  type HourlyWeather,
} from "#lib/weather.js";

type WeatherState = {
  current: CurrentWeather | null;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  updatedAt: number | null;
  unavailable: boolean;
};

const WEATHER_CONTEXT_KEY = "minimalist-home:weather";
const initialState: WeatherState = {
  current: null,
  hourly: [],
  daily: [],
  updatedAt: null,
  unavailable: false,
};

function createWeatherStore() {
  return readable<WeatherState>(initialState, (set) => {
    let activeRequest: AbortController | undefined;
    let refreshInterval: number | undefined;
    let latestSettings: AppSettings;
    let settingsKey = "";

    async function update(settings: AppSettings) {
      activeRequest?.abort();
      const request = new AbortController();
      activeRequest = request;

      try {
        const snapshot = await getWeatherSnapshot(
          settings.location,
          settings.language,
          request.signal,
        );
        set({ ...snapshot, unavailable: false });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          set({ ...initialState, unavailable: true });
        }
      } finally {
        if (activeRequest === request) activeRequest = undefined;
      }
    }

    function startRefreshInterval() {
      window.clearInterval(refreshInterval);
      refreshInterval = window.setInterval(
        () => void update(latestSettings),
        WEATHER_REFRESH_INTERVAL,
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        window.clearInterval(refreshInterval);
        refreshInterval = undefined;
        activeRequest?.abort();
        return;
      }

      void update(latestSettings);
      startRefreshInterval();
    }

    const unsubscribeSettings = appSettings.subscribe((settings) => {
      latestSettings = settings;
      const nextKey = `${settings.location.latitude}:${settings.location.longitude}:${settings.location.timezone}:${settings.language}`;

      if (nextKey !== settingsKey) {
        settingsKey = nextKey;
        if (document.visibilityState === "visible") void update(settings);
      }
    });
    if (document.visibilityState === "visible") startRefreshInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribeSettings();
      activeRequest?.abort();
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  });
}

export type WeatherStore = ReturnType<typeof createWeatherStore>;

export function provideWeatherStore() {
  const store = createWeatherStore();
  setContext(WEATHER_CONTEXT_KEY, store);
  return store;
}

export function getWeatherStore() {
  return getContext<WeatherStore>(WEATHER_CONTEXT_KEY);
}
