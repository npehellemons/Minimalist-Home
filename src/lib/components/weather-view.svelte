<script lang="ts">
  import {
    Cloud,
    CloudMoon,
    Dog,
    Droplets,
    Eye,
    Gauge,
    Moon,
    Sunrise,
    Sunset,
    Umbrella,
    Wind,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { appSettings } from "#lib/app-settings.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import { getWeatherStore } from "#lib/weather-store.js";
  import {
    bestSkyWindow,
    bestWalkPeriod,
    findCurrentHourIndex,
    getSkyConditions,
    getTodayHours,
    getUpcomingNight,
    groupWeatherPeriods,
    type WeatherPeriod,
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
  let weatherPeriods = $derived(groupWeatherPeriods(todayHours));
  let walkPeriod = $derived(bestWalkPeriod([...weatherPeriods]));
  let nextWetPeriod = $derived(weatherPeriods.find((period) => period.status === "wet"));
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

  onMount(() => {
    const interval = window.setInterval(() => {
      if (active) now = new Date();
    }, 60_000);
    return () => window.clearInterval(interval);
  });

  function timeLabel(value: string | null | undefined) {
    return value?.slice(11, 16) ?? "--:--";
  }

  function periodLabel(period: WeatherPeriod | undefined) {
    if (!period) return text.weather.noDryPeriod;
    return `${timeLabel(period.start)}–${timeLabel(period.end)}`;
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

  function statusLabel(status: WeatherPeriod["status"]) {
    if (status === "dry") return text.weather.dry;
    if (status === "wet") return text.weather.rain;
    return text.weather.uncertain;
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-muted/30">
  <Tabs.Root bind:value={selectedView} class="flex min-h-0 flex-1 flex-col gap-0">
    <div class="shrink-0 border-b bg-background px-3 py-2 md:px-6">
      <Tabs.List class="w-full md:w-auto">
        <Tabs.Trigger value="forecast" class="flex-1 md:flex-none">
          {text.weather.forecast}
        </Tabs.Trigger>
        <Tabs.Trigger value="sky" class="flex-1 md:flex-none">
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
          <div class="grid gap-3 p-3 md:grid-cols-12 md:gap-4 md:p-6">
            <Card.Root size="sm" class="md:col-span-5">
              <Card.Content class="flex h-full items-center gap-5">
                <WeatherIcon kind={current.kind} isDay={current.isDay} class="size-16 shrink-0 md:size-20" />
                <div class="min-w-0">
                  <p class="text-sm text-muted-foreground">{text.weather.current} · {$appSettings.location.name}</p>
                  <div class="flex items-end gap-3">
                    <strong class="text-5xl font-semibold leading-none tabular-nums md:text-6xl">
                      {Math.round(current.temperature)}°
                    </strong>
                    <span class="pb-1 text-sm text-muted-foreground">
                      {text.weather.feelsLike} {Math.round(current.apparentTemperature)}°
                    </span>
                  </div>
                  <p class="mt-2 font-medium">{current.description}</p>
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="md:col-span-4">
              <Card.Header>
                <Card.Title class="text-sm">{text.weather.today}</Card.Title>
              </Card.Header>
              <Card.Content class="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
                <div><span class="text-muted-foreground">{text.weather.highLow}</span><strong class="block">{Math.round(today.temperatureMax)}° / {Math.round(today.temperatureMin)}°</strong></div>
                <div><span class="text-muted-foreground">{text.weather.precipitation}</span><strong class="block">{today.precipitationProbabilityMax}% · {today.precipitationSum} mm</strong></div>
                <div class="flex items-center gap-2"><Sunrise class="size-4 text-muted-foreground" /> {timeLabel(today.sunrise)}</div>
                <div class="flex items-center gap-2"><Sunset class="size-4 text-muted-foreground" /> {timeLabel(today.sunset)}</div>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="md:col-span-3">
              <Card.Header>
                <Card.Title class="text-sm">{text.weather.current}</Card.Title>
              </Card.Header>
              <Card.Content class="grid grid-cols-2 gap-3 text-sm md:grid-cols-1">
                <span class="flex items-center gap-2"><Droplets class="size-4 text-muted-foreground" /> {current.humidity}%</span>
                <span class="flex items-center gap-2"><Cloud class="size-4 text-muted-foreground" /> {current.cloudCover}%</span>
                <span class="flex items-center gap-2"><Wind class="size-4 text-muted-foreground" /> {windDirection(current.windDirection)} {Math.round(current.windSpeed)} {current.windUnit}</span>
                <span class="flex items-center gap-2"><Gauge class="size-4 text-muted-foreground" /> {Math.round(current.pressure)} {current.pressureUnit}</span>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="md:col-span-12">
              <Card.Header class="border-b">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <Dog class="size-5 text-muted-foreground" />
                    <div>
                      <Card.Title class="text-sm">{text.weather.dogWalk}</Card.Title>
                      <Card.Description>{text.weather.bestWalk}</Card.Description>
                    </div>
                  </div>
                  {#if walkPeriod}
                    <Badge variant={walkPeriod.status === "dry" ? "default" : "secondary"}>
                      {periodLabel(walkPeriod)}
                    </Badge>
                  {/if}
                </div>
              </Card.Header>
              <Card.Content class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div class="mb-3 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-label={text.weather.dryPeriods}>
                    {#each weatherPeriods as period}
                      <div
                        class={period.status === "dry"
                          ? "bg-emerald-500"
                          : period.status === "wet"
                            ? "bg-sky-500"
                            : "bg-muted-foreground/35"}
                        style:width={`${(period.hours.length / Math.max(todayHours.length, 1)) * 100}%`}
                        title={`${periodLabel(period)} · ${statusLabel(period.status)}`}
                      ></div>
                    {/each}
                  </div>
                  <p class="mb-2 text-xs font-medium text-muted-foreground">{text.weather.dryPeriods}</p>
                  <div class="flex flex-wrap gap-2">
                    {#each weatherPeriods.filter((period) => period.status !== "wet") as period}
                      <Badge variant="outline">
                        {periodLabel(period)} · {statusLabel(period.status)}
                      </Badge>
                    {:else}
                      <span class="text-sm text-muted-foreground">{text.weather.noDryPeriod}</span>
                    {/each}
                  </div>
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <Umbrella class="size-4 text-muted-foreground" />
                  {nextWetPeriod
                    ? `${text.weather.nextRain}: ${timeLabel(nextWetPeriod.start)}`
                    : text.weather.noRain}
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="min-w-0 md:col-span-12">
              <Card.Header><Card.Title class="text-sm">{text.weather.hourly}</Card.Title></Card.Header>
              <ScrollArea.Root orientation="horizontal" class="w-full">
                <Card.Content class="flex w-max min-w-full divide-x px-0 pb-0">
                  {#each upcomingHours as hour}
                    <div class="grid w-28 shrink-0 justify-items-center gap-2 px-3 pb-4 md:w-32">
                      <time class="text-xs text-muted-foreground" datetime={hour.time}>{timeLabel(hour.time)}</time>
                      <WeatherIcon kind={hour.kind} isDay={hour.isDay} class="size-7" />
                      <strong class="tabular-nums">{Math.round(hour.temperature)}°</strong>
                      <span class="flex items-center gap-1 text-xs text-muted-foreground"><Droplets class="size-3" />{hour.precipitationProbability}%</span>
                      <span class="flex items-center gap-1 text-xs text-muted-foreground"><Wind class="size-3" />{Math.round(hour.windSpeed)}</span>
                    </div>
                  {/each}
                </Card.Content>
              </ScrollArea.Root>
            </Card.Root>

            <Card.Root size="sm" class="md:col-span-12">
              <Card.Header><Card.Title class="text-sm">{text.weather.sevenDays}</Card.Title></Card.Header>
              <Card.Content class="grid gap-1">
                {#each daily as day, index}
                  <div class="grid grid-cols-[minmax(5rem,1fr)_2rem_4.5rem_4.5rem] items-center gap-3 border-t py-2 first:border-t-0 md:grid-cols-[minmax(7rem,1fr)_2rem_7rem_7rem_7rem]">
                    <span class="truncate text-sm font-medium">{index === 0 ? text.weather.today : dayLabel(day.time, true)}</span>
                    <WeatherIcon kind={day.kind} isDay={true} class="size-5" />
                    <span class="text-sm tabular-nums"><strong>{Math.round(day.temperatureMax)}°</strong> / {Math.round(day.temperatureMin)}°</span>
                    <span class="flex items-center gap-1 text-xs text-muted-foreground"><Droplets class="size-3.5" />{day.precipitationProbabilityMax}%</span>
                    <span class="hidden items-center gap-1 text-xs text-muted-foreground md:flex"><Wind class="size-3.5" />{Math.round(day.windSpeedMax)} {current.windUnit}</span>
                  </div>
                {/each}
              </Card.Content>
            </Card.Root>

            <p class="text-xs text-muted-foreground md:col-span-12">
              Data: Open-Meteo
            </p>
          </div>
        </ScrollArea.Root>
      </Tabs.Content>

      <Tabs.Content value="sky" class="min-h-0 flex-1">
        <ScrollArea.Root class="h-full">
          <div class="grid gap-3 p-3 md:grid-cols-12 md:gap-4 md:p-6">
            <Card.Root size="sm" class="md:col-span-5">
              <Card.Header>
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <Card.Title>{text.weather.tonight}</Card.Title>
                    <Card.Description>{text.weather.skyExplanation}</Card.Description>
                  </div>
                  <CloudMoon class="size-8 text-muted-foreground" />
                </div>
              </Card.Header>
              <Card.Content class="grid gap-3">
                <div class="flex items-end justify-between gap-4">
                  <strong class="text-3xl">{skyLabel(averageSkyScore)}</strong>
                  <span class="text-2xl font-semibold tabular-nums">{averageSkyScore}/100</span>
                </div>
                <Progress value={averageSkyScore} />
                <div class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-muted-foreground">{text.weather.bestSkyWindow}</span>
                  <strong>{bestViewingWindow.length > 0 ? `${timeLabel(bestViewingWindow[0].hour.time)}–${windowEndLabel(bestViewingWindow)}` : "--:--"}</strong>
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="md:col-span-4">
              <Card.Header><Card.Title class="text-sm">{text.weather.moon}</Card.Title></Card.Header>
              <Card.Content class="flex items-center gap-4">
                <Moon class="size-12 text-muted-foreground" />
                <div>
                  <strong>{moonLabel(today.moonPhase)}</strong>
                  <p class="mt-1 text-sm text-muted-foreground">{text.weather.moonrise} {timeLabel(today.moonrise)} · {text.weather.moonset} {timeLabel(today.moonset)}</p>
                </div>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="md:col-span-3">
              <Card.Header><Card.Title class="text-sm">{text.weather.tonight}</Card.Title></Card.Header>
              <Card.Content class="grid gap-3 text-sm">
                <span class="flex items-center gap-2"><Sunset class="size-4 text-muted-foreground" /> {text.weather.sunset} {timeLabel(today.sunset)}</span>
                <span class="flex items-center gap-2"><Sunrise class="size-4 text-muted-foreground" /> {text.weather.sunrise} {timeLabel(today.sunrise)}</span>
              </Card.Content>
            </Card.Root>

            <Card.Root size="sm" class="min-w-0 md:col-span-12">
              <Card.Header><Card.Title class="text-sm">{text.weather.tonight}</Card.Title></Card.Header>
              <ScrollArea.Root orientation="horizontal" class="w-full">
                <Card.Content class="flex w-max min-w-full divide-x px-0 pb-0">
                  {#each skyConditions as condition}
                    <article class="grid w-40 shrink-0 gap-3 px-4 pb-4">
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
                      <div class="grid gap-1 text-xs">
                        <span class="flex justify-between"><span>{text.weather.lowClouds}</span><strong>{condition.hour.cloudCoverLow}%</strong></span>
                        <span class="flex justify-between"><span>{text.weather.midClouds}</span><strong>{condition.hour.cloudCoverMid}%</strong></span>
                        <span class="flex justify-between"><span>{text.weather.highClouds}</span><strong>{condition.hour.cloudCoverHigh}%</strong></span>
                      </div>
                    </article>
                  {/each}
                </Card.Content>
              </ScrollArea.Root>
            </Card.Root>

            <p class="text-xs text-muted-foreground md:col-span-12">
              Data: Open-Meteo
            </p>
          </div>
        </ScrollArea.Root>
      </Tabs.Content>
    {/if}
  </Tabs.Root>
</div>
