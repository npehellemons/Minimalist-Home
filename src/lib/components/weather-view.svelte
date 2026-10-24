<script lang="ts">
  import {
    Cloud,
    CloudMoon,
    Compass,
    Dog,
    Droplets,
    Eye,
    Gauge,
    Moon,
    Sunrise,
    Sunset,
    Telescope,
    Wind,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { appSettings } from "#lib/app-settings.js";
  import { getObservationTargets } from "#lib/astronomy-targets.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import { getWeatherStore } from "#lib/weather-store.js";
  import {
    bestSkyWindow,
    findCurrentHourIndex,
    getSkyConditions,
    getTodayHours,
    getUpcomingNight,
    precipitationStatus,
    skyScore,
  } from "#lib/weather-insights.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import WeatherIcon from "#lib/components/weather-icon.svelte";

  let { active = true }: { active?: boolean } = $props();

  const weatherStore = getWeatherStore();
  let now = $state(new Date());
  let selectedView = $state("forecast");
  let text = $derived(translations[$appSettings.language]);
  let locale = $derived(appLocale($appSettings.language));
  let current = $derived($weatherStore.current);
  let hourly = $derived($weatherStore.hourly);
  let daily = $derived($weatherStore.daily);
  let todayHours = $derived(getTodayHours(hourly, now, $appSettings.location.timezone));
  let bestWalkHours = $derived(
    todayHours
      .filter((hour) => precipitationStatus(hour) === "dry")
      .sort((first, second) => {
        const cloudDifference = first.cloudCover - second.cloudCover;
        if (cloudDifference !== 0) return cloudDifference;
        const rainDifference = first.precipitationProbability - second.precipitationProbability;
        if (rainDifference !== 0) return rainDifference;
        return first.windGusts - second.windGusts;
      })
      .slice(0, 3)
      .sort((first, second) => first.time.localeCompare(second.time)),
  );
  let currentHourIndex = $derived(
    findCurrentHourIndex(hourly, now, $appSettings.location.timezone),
  );
  let upcomingHours = $derived(hourly.slice(currentHourIndex, currentHourIndex + 24));
  let nightHours = $derived(getUpcomingNight(hourly, now, $appSettings.location.timezone));
  let skyConditions = $derived(getSkyConditions(nightHours));
  let bestViewingWindow = $derived(bestSkyWindow(skyConditions));
  let averageSkyScore = $derived(
    skyConditions.length > 0
      ? Math.round(
          skyConditions.reduce((sum, condition) => sum + condition.score, 0) /
            skyConditions.length,
        )
      : 0,
  );
  let today = $derived(daily[0]);
  let nightSummaries = $derived(
    daily.map((day, index) => {
      const nextSunrise = daily[index + 1]?.sunrise;
      const hours = hourly.filter(
        (hour) => hour.time >= day.sunset && (!nextSunrise || hour.time < nextSunrise) && !hour.isDay,
      );
      const score = hours.length > 0
        ? Math.round(hours.reduce((sum, hour) => sum + skyScore(hour), 0) / hours.length)
        : 0;
      return { day, score };
    }),
  );
  let observationDates = $derived(
    nightHours.map((hour) => {
      const index = hourly.findIndex((candidate) => candidate.time === hour.time);
      const currentHour = new Date(now);
      currentHour.setMinutes(0, 0, 0);
      return new Date(currentHour.getTime() + Math.max(0, index - currentHourIndex) * 3_600_000);
    }),
  );
  let observationTargets = $derived(
    today
      ? getObservationTargets(
          $appSettings.location.latitude,
          $appSettings.location.longitude,
          observationDates,
          today.moonPhase,
        )
      : [],
  );

  onMount(() => {
    const interval = window.setInterval(() => {
      if (active) now = new Date();
    }, 60_000);
    return () => window.clearInterval(interval);
  });

  function timeLabel(value: string | null | undefined) {
    return value?.slice(11, 16) ?? "--:--";
  }

  function hourRangeLabel(value: string) {
    const hour = Number(value.slice(11, 13));
    return `${timeLabel(value)}–${String((hour + 1) % 24).padStart(2, "0")}:00`;
  }

  function windowEndLabel(period: typeof bestViewingWindow) {
    const last = period.at(-1)?.hour.time;
    if (!last) return "--:--";
    const nextHour = (Number(last.slice(11, 13)) + 1) % 24;
    return `${String(nextHour).padStart(2, "0")}:00`;
  }

  function dayLabel(value: string, long = false) {
    return new Intl.DateTimeFormat(locale, {
      weekday: long ? "long" : "short",
      day: long ? "numeric" : undefined,
      month: long ? "short" : undefined,
      timeZone: $appSettings.location.timezone,
    })
      .format(new Date(`${value}T12:00:00`))
      .replace(".", "");
  }

  function windDirection(degrees: number) {
    const points = $appSettings.language === "nl"
      ? ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"]
      : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return points[Math.round(degrees / 45) % 8];
  }

  function skyLabel(score: number) {
    if (score >= 80) return text.weather.skyExcellent;
    if (score >= 65) return text.weather.skyGood;
    if (score >= 45) return text.weather.skyFair;
    return text.weather.skyPoor;
  }

  function moonLabel(phase: number) {
    if (phase < 0.03 || phase >= 0.97) return text.weather.moonNew;
    if (phase < 0.22) return text.weather.moonWaxingCrescent;
    if (phase < 0.28) return text.weather.moonFirstQuarter;
    if (phase < 0.47) return text.weather.moonWaxingGibbous;
    if (phase < 0.53) return text.weather.moonFull;
    if (phase < 0.72) return text.weather.moonWaningGibbous;
    if (phase < 0.78) return text.weather.moonLastQuarter;
    return text.weather.moonWaningCrescent;
  }

  function targetLabel(id: string) {
    return text.weather.targets[id as keyof typeof text.weather.targets] ?? id;
  }

  function equipmentLabel(equipment: "eyes" | "binoculars" | "telescope") {
    return text.weather.equipment[equipment];
  }

  function observationTime(value: Date) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: $appSettings.location.timezone,
    }).format(value);
  }

</script>

<div class="flex h-full min-h-0 flex-col bg-muted/30">
  <Tabs.Root bind:value={selectedView} class="flex min-h-0 flex-1 flex-col gap-0">
    <div class="shrink-0 border-b bg-background px-3 py-2 md:px-6">
      <Tabs.List class="grid! h-9! w-full grid-cols-2! md:w-64">
        <Tabs.Trigger value="forecast" class="w-auto! min-w-0 justify-center!">
          {text.weather.forecast}
        </Tabs.Trigger>
        <Tabs.Trigger value="sky" class="w-auto! min-w-0 justify-center!">
          {text.weather.skyConditions}
        </Tabs.Trigger>
      </Tabs.List>
    </div>

    {#if $weatherStore.unavailable && !current}
      <div class="grid min-h-0 flex-1 place-items-center p-6 text-sm text-muted-foreground">
        {text.weather.unavailable}
      </div>
    {:else if !current || daily.length === 0 || hourly.length === 0}
      <div class="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 md:grid-cols-3 md:p-6">
        <Skeleton class="h-40 md:col-span-2" />
        <Skeleton class="h-40" />
        <Skeleton class="min-h-52 md:col-span-3" />
      </div>
    {:else}
      <Tabs.Content value="forecast" class="min-h-0 flex-1">
        <ScrollArea.Root class="h-full">
          <div class="grid auto-rows-max gap-3 p-3 md:grid-cols-12 md:gap-4 md:p-4">
            <Card.Root size="sm" class="overflow-hidden py-0 md:col-span-12 md:row-start-1">
              <Card.Content class="grid gap-0 px-0 md:grid-cols-12">
                <section class="flex min-w-0 items-center gap-3 border-b p-3 md:col-span-5 md:border-r md:border-b-0">
                  <WeatherIcon kind={current.kind} isDay={current.isDay} class="size-12 shrink-0" />
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-muted-foreground">{text.weather.current} · {$appSettings.location.name}</p>
                    <div class="mt-1 flex items-end gap-3">
                      <strong class="text-4xl font-semibold leading-none tabular-nums">
                        {Math.round(current.temperature)}°
                      </strong>
                      <span class="pb-1 text-sm text-muted-foreground">
                        {text.weather.feelsLike} {Math.round(current.apparentTemperature)}°
                      </span>
                    </div>
                    <p class="mt-1 text-sm font-medium">{current.description}</p>
                  </div>
                </section>

                <section class="border-b p-3 md:col-span-4 md:border-r md:border-b-0">
                  <h2 class="mb-2 text-sm font-semibold">{text.weather.today}</h2>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div><span class="text-xs text-muted-foreground">{text.weather.highLow}</span><strong class="block">{Math.round(today.temperatureMax)}° / {Math.round(today.temperatureMin)}°</strong></div>
                    <div><span class="text-xs text-muted-foreground">{text.weather.precipitation}</span><strong class="block">{today.precipitationProbabilityMax}% · {today.precipitationSum} mm</strong></div>
                    <div class="flex items-center gap-2"><Sunrise class="size-4 text-muted-foreground" /> {timeLabel(today.sunrise)}</div>
                    <div class="flex items-center gap-2"><Sunset class="size-4 text-muted-foreground" /> {timeLabel(today.sunset)}</div>
                  </div>
                </section>

                <section class="grid grid-cols-2 content-center gap-2 p-3 text-sm md:col-span-3 md:grid-cols-1">
                  <span class="flex items-center gap-2"><Droplets class="size-4 text-muted-foreground" /> {current.humidity}%</span>
                  <span class="flex items-center gap-2"><Cloud class="size-4 text-muted-foreground" /> {current.cloudCover}%</span>
                  <span class="flex items-center gap-2"><Wind class="size-4 text-muted-foreground" /> {windDirection(current.windDirection)} {Math.round(current.windSpeed)} {current.windUnit}</span>
                  <span class="flex items-center gap-2"><Gauge class="size-4 text-muted-foreground" /> {Math.round(current.pressure)} {current.pressureUnit}</span>
                </section>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="overflow-hidden py-0 md:col-span-7 md:row-start-2">
              <Card.Content class="flex-row! flex-wrap items-center gap-3 px-4 py-3">
                <div class="flex items-center gap-2">
                  <Dog class="size-5 text-muted-foreground" />
                  <div>
                    <Card.Title class="text-sm">{text.weather.dogWalk}</Card.Title>
                    <Card.Description class="text-xs">{text.weather.bestWalk}</Card.Description>
                  </div>
                </div>
                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:justify-end">
                  {#each bestWalkHours as hour}
                    <Badge variant="outline">
                      {hourRangeLabel(hour.time)} · {hour.cloudCover}% {text.weather.cloudCover.toLowerCase()}
                    </Badge>
                  {:else}
                    <span class="text-sm text-muted-foreground">{text.weather.noDryPeriod}</span>
                  {/each}
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="min-w-0 overflow-hidden py-0 md:col-span-7 md:row-start-3">
              <div class="px-4 pt-3"><Card.Title class="text-sm">{text.weather.hourly}</Card.Title></div>
              <ScrollArea.Root orientation="horizontal" class="w-full min-w-0" viewportClass="w-full max-w-full">
                <div class="flex w-max min-w-full flex-row divide-x px-1 py-2">
                  {#each upcomingHours as hour}
                    <div class="grid w-24 shrink-0 grid-cols-2 items-center gap-x-2 gap-y-1 px-3 py-1 md:w-28">
                      <time class="text-xs text-muted-foreground" datetime={hour.time}>{timeLabel(hour.time)}</time>
                      <WeatherIcon kind={hour.kind} isDay={hour.isDay} class="size-6 justify-self-end" />
                      <strong class="text-sm tabular-nums">{Math.round(hour.temperature)}°</strong>
                      <span class="flex items-center gap-1 text-xs text-muted-foreground"><Droplets class="size-3" />{hour.precipitationProbability}%</span>
                      <span class="col-span-2 flex items-center gap-1 text-xs text-muted-foreground"><Wind class="size-3" />{Math.round(hour.windSpeed)} {current.windUnit}</span>
                    </div>
                  {/each}
                </div>
              </ScrollArea.Root>
            </Card.Root>

            <Card.Root size="sm" class="overflow-hidden py-0 md:col-span-5 md:col-start-8 md:row-start-2 md:row-span-2">
              <div class="px-4 pt-3"><Card.Title class="text-sm">{text.weather.sevenDays}</Card.Title></div>
              <Card.Content class="grid gap-0 px-4 pb-3">
                {#each daily as day, index}
                  <div class="grid grid-cols-[minmax(5rem,1fr)_1.5rem_4rem_3.5rem] items-center gap-2 border-t py-1.5 first:border-t-0 md:grid-cols-[minmax(5rem,1fr)_1.5rem_3.5rem_3rem_4.5rem]">
                    <span class="truncate text-xs font-medium">{index === 0 ? text.weather.today : dayLabel(day.time, true)}</span>
                    <WeatherIcon kind={day.kind} isDay={true} class="size-5" />
                    <span class="text-xs tabular-nums"><strong>{Math.round(day.temperatureMax)}°</strong> / {Math.round(day.temperatureMin)}°</span>
                    <span class="flex items-center gap-1 text-xs text-muted-foreground"><Droplets class="size-3.5" />{day.precipitationProbabilityMax}%</span>
                    <span class="hidden items-center gap-1 text-xs text-muted-foreground md:flex"><Wind class="size-3.5" />{Math.round(day.windSpeedMax)} {current.windUnit}</span>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>

            <p class="text-xs text-muted-foreground md:col-span-12 md:row-start-4">
              Data: Open-Meteo
            </p>
          </div>
        </ScrollArea.Root>
      </Tabs.Content>

      <Tabs.Content value="sky" class="min-h-0 flex-1">
        <ScrollArea.Root class="h-full">
          <div class="grid auto-rows-max gap-3 p-3 md:grid-cols-12 md:gap-3 md:p-4">
            <Card.Root size="sm" class="overflow-hidden py-0 md:col-span-12">
              <Card.Content class="grid gap-0 px-0 md:grid-cols-12">
                <section class="grid gap-1.5 border-b p-3 md:col-span-5 md:border-r md:border-b-0">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <Card.Title class="text-sm">{text.weather.tonight}</Card.Title>
                      <Card.Description class="text-xs">{text.weather.skyExplanation}</Card.Description>
                    </div>
                    <CloudMoon class="size-7 text-muted-foreground" />
                  </div>
                  <div class="flex items-end justify-between gap-4">
                    <strong class="text-2xl">{skyLabel(averageSkyScore)}</strong>
                    <span class="text-xl font-semibold tabular-nums">{averageSkyScore}/100</span>
                  </div>
                  <Progress value={averageSkyScore} />
                  <div class="flex items-center justify-between gap-3 text-xs">
                    <span class="text-muted-foreground">{text.weather.bestSkyWindow}</span>
                    <strong>{bestViewingWindow.length > 0 ? `${timeLabel(bestViewingWindow[0].hour.time)}–${windowEndLabel(bestViewingWindow)}` : "--:--"}</strong>
                  </div>
                </section>

                <section class="flex items-center gap-3 border-b p-3 md:col-span-4 md:border-r md:border-b-0">
                  <Moon class="size-9 shrink-0 text-muted-foreground" />
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-muted-foreground">{text.weather.moon}</p>
                    <strong>{moonLabel(today.moonPhase)}</strong>
                    <p class="mt-1 text-xs text-muted-foreground">{text.weather.moonrise} {timeLabel(today.moonrise)} · {text.weather.moonset} {timeLabel(today.moonset)}</p>
                  </div>
                </section>

                <section class="grid content-center gap-2 p-3 text-sm md:col-span-3">
                  <span class="flex items-center gap-2"><Sunset class="size-4 text-muted-foreground" /> {text.weather.sunset} {timeLabel(today.sunset)}</span>
                  <span class="flex items-center gap-2"><Sunrise class="size-4 text-muted-foreground" /> {text.weather.sunrise} {timeLabel(today.sunrise)}</span>
                </section>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="min-w-0 overflow-hidden py-0 md:col-span-12">
              <div class="px-4 pt-3"><Card.Title class="text-sm">{text.weather.tonight}</Card.Title></div>
              <ScrollArea.Root orientation="horizontal" class="w-full min-w-0" viewportClass="w-full max-w-full">
                <div class="flex w-max min-w-full flex-row divide-x px-1 py-2">
                  {#each skyConditions as condition}
                    <article class="grid w-36 shrink-0 gap-2 px-3 py-1">
                      <div class="flex items-center justify-between">
                        <time class="font-medium tabular-nums" datetime={condition.hour.time}>{timeLabel(condition.hour.time)}</time>
                        <Badge variant="outline">{condition.score}</Badge>
                      </div>
                      <div class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span class="flex items-center gap-1"><Cloud class="size-3.5" />{condition.hour.cloudCover}%</span>
                        <span class="flex items-center gap-1"><Eye class="size-3.5" />{Math.round(condition.hour.visibility / 1000)} km</span>
                        <span class="flex items-center gap-1"><Droplets class="size-3.5" />{condition.hour.humidity}%</span>
                        <span class="flex items-center gap-1"><Wind class="size-3.5" />{Math.round(condition.hour.windGusts)}</span>
                      </div>
                      <div class="flex justify-between gap-2 text-xs">
                        <span title={text.weather.lowClouds}>L <strong>{condition.hour.cloudCoverLow}%</strong></span>
                        <span title={text.weather.midClouds}>M <strong>{condition.hour.cloudCoverMid}%</strong></span>
                        <span title={text.weather.highClouds}>H <strong>{condition.hour.cloudCoverHigh}%</strong></span>
                      </div>
                    </article>
                  {/each}
                </div>
              </ScrollArea.Root>
            </Card.Root>

            <Card.Root size="sm" class="min-w-0 overflow-hidden py-0 md:col-span-12">
              <div class="flex items-center gap-2 px-4 pt-3">
                <Telescope class="size-4 text-muted-foreground" />
                <Card.Title class="text-sm">{text.weather.observingTargets}</Card.Title>
              </div>
              <div class="grid grid-cols-2 divide-x px-1 py-2 md:grid-cols-4">
                {#each observationTargets as target}
                  <div class="grid min-w-0 gap-1 px-3 py-1">
                    <div class="flex items-center justify-between gap-2">
                      <strong class="truncate text-sm">{targetLabel(target.id)}</strong>
                      <Badge variant="outline">{target.altitude}°</Badge>
                    </div>
                    <span class="truncate text-xs text-muted-foreground">{equipmentLabel(target.equipment)}</span>
                    <span class="flex items-center gap-1 text-xs text-muted-foreground">
                      <Compass class="size-3.5" />
                      {windDirection(target.azimuth)} · {observationTime(target.time)}
                    </span>
                  </div>
                {/each}
              </div>
            </Card.Root>

            <Card.Root size="sm" class="min-w-0 overflow-hidden py-0 md:col-span-12">
              <div class="px-4 pt-3"><Card.Title class="text-sm">{text.weather.upcomingNights}</Card.Title></div>
              <ScrollArea.Root orientation="horizontal" class="w-full min-w-0" viewportClass="w-full max-w-full">
                <div class="flex w-max min-w-full flex-row divide-x px-1 py-2">
                  {#each nightSummaries as summary}
                    <div class="grid w-32 shrink-0 grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 px-3 py-1 md:flex-1">
                      <strong class="truncate text-sm">{dayLabel(summary.day.time)}</strong>
                      <WeatherIcon kind={summary.day.kind} isDay={false} class="size-5" />
                      <span class="text-xs text-muted-foreground">{moonLabel(summary.day.moonPhase)}</span>
                      <Badge variant="outline" class="justify-self-end">{summary.score}</Badge>
                    </div>
                  {/each}
                </div>
              </ScrollArea.Root>
            </Card.Root>

            <p class="text-xs text-muted-foreground md:col-span-12">
              Data: Open-Meteo · Astronomy Engine
            </p>
          </div>
        </ScrollArea.Root>
      </Tabs.Content>
    {/if}
  </Tabs.Root>
</div>
