<script lang="ts">
  import { Droplets, Wind } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { appSettings } from "#lib/app-settings.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import { getWeatherStore } from "#lib/weather-store.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import WeatherIcon from "#lib/components/weather-icon.svelte";

  const VISIBLE_FORECAST_HOURS = 7;

  let { onExit }: { onExit: () => void } = $props();

  let now = $state(new Date());
  const weatherStore = getWeatherStore();
  let hourlyForecast = $derived($weatherStore.hourly);
  let forecastUnavailable = $derived($weatherStore.unavailable);
  let locale = $derived(appLocale($appSettings.language));
  let text = $derived(translations[$appSettings.language]);
  let weekday = $derived(
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: $appSettings.location.timezone,
    })
      .format(now)
      .replace(".", ""),
  );
  let month = $derived(
    new Intl.DateTimeFormat(locale, {
      month: "short",
      timeZone: $appSettings.location.timezone,
    })
      .format(now)
      .replace(".", ""),
  );
  let day = $derived(
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      timeZone: $appSettings.location.timezone,
    }).format(now),
  );
  let time = $derived(
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: $appSettings.location.timezone,
    }).format(now),
  );
  let visibleForecast = $derived.by(() => {
    const currentHour = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: $appSettings.location.timezone,
    })
      .format(now)
      .padStart(2, "0");
    const currentIndex = hourlyForecast.findIndex((entry) =>
      entry.time.endsWith(`T${currentHour}:00`),
    );
    const start = Math.max(currentIndex, 0);

    return hourlyForecast.slice(start, start + VISIBLE_FORECAST_HOURS);
  });

  onMount(() => {
    let clockTimeout: number;

    function scheduleClockUpdate() {
      const delayUntilNextMinute = 60_000 - (Date.now() % 60_000) + 50;

      clockTimeout = window.setTimeout(() => {
        now = new Date();
        scheduleClockUpdate();
      }, delayUntilNextMinute);
    }

    scheduleClockUpdate();

    return () => {
      window.clearTimeout(clockTimeout);
    };
  });
</script>

<main class="h-full w-full bg-background">
  <Button
    variant="ghost"
    class="h-full w-full cursor-default rounded-none p-0 hover:bg-background active:translate-y-0"
    aria-label={$appSettings.language === "nl"
      ? "Screensaver. Raak het scherm aan om terug te gaan."
      : "Screensaver. Touch anywhere to return to the dashboard."}
    onclick={onExit}
  >
    <section
      class="grid h-full w-full grid-rows-[minmax(0,1fr)_17rem] text-left text-foreground"
      aria-label="Screensaver content"
    >
      <header class="grid min-h-0 grid-cols-2 items-center px-12">
        <time class="grid justify-items-start" datetime={now.toISOString()}>
          <span class="text-6xl font-semibold text-muted-foreground">
            {weekday} {month}
          </span>
          <span class="text-[17rem] font-bold leading-[0.85]">{day}</span>
        </time>

        <time
          class="justify-self-center text-[11rem] font-bold leading-none tabular-nums"
          datetime={now.toISOString()}
        >
          {time}
        </time>
      </header>

      <div class="border-t px-10 py-8" aria-live="polite">
        {#if visibleForecast.length > 0}
          <div class="grid h-full grid-flow-col auto-cols-fr">
            {#each visibleForecast as forecast}
              {@const forecastTime = forecast.time.slice(11, 16)}
              <article
                class="flex min-w-0 flex-col items-center justify-between border-l px-3 first:border-l-0"
                aria-label={`${forecastTime}, ${forecast.description}, ${Math.round(forecast.temperature)} ${text.weather.degrees}, ${forecast.precipitationProbability}% ${text.weather.precipitation}, ${Math.round(forecast.windSpeed)} ${forecast.windUnit} ${text.weather.wind}`}
              >
                <time
                  class="text-sm font-medium tabular-nums text-muted-foreground"
                  datetime={forecast.time}
                >
                  {forecastTime}
                </time>
                <WeatherIcon
                  kind={forecast.kind}
                  isDay={forecast.isDay}
                  class="size-9"
                />
                <strong class="text-2xl font-semibold tabular-nums">
                  {Math.round(forecast.temperature)}°
                </strong>
                <span class="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Droplets class="size-3.5" aria-hidden="true" />
                  {forecast.precipitationProbability}%
                </span>
                <span class="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Wind class="size-3.5" aria-hidden="true" />
                  {Math.round(forecast.windSpeed)} {forecast.windUnit}
                </span>
              </article>
            {/each}
          </div>
        {:else if forecastUnavailable}
          <div class="grid h-full place-items-center text-sm font-normal text-muted-foreground">
            {text.weather.unavailable}
          </div>
        {:else}
          <div class="grid h-full grid-cols-7 gap-4" aria-label={text.weather.loading}>
            {#each Array(VISIBLE_FORECAST_HOURS) as _}
              <Skeleton class="h-full w-full" />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </Button>
</main>
