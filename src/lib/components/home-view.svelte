<script lang="ts">
  import {
    CalendarDays,
    Clock3,
    Droplets,
    ListChecks,
    MapPin,
    Repeat2,
    Wind,
  } from "@lucide/svelte";
  import { get } from "svelte/store";
  import { Temporal } from "temporal-polyfill";

  import {
    activeProfileId,
    appSettings,
    type HouseholdProfile,
  } from "#lib/app-settings.js";
  import {
    getHouseholdCalendarEvents,
    type HouseholdCalendarEvent,
  } from "#lib/calendar-events.js";
  import { CALENDAR_REFRESH_INTERVAL } from "#lib/calendar-feed.js";
  import ProfileAvatar from "#lib/components/profile-avatar.svelte";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import WeatherIcon from "#lib/components/weather-icon.svelte";
  import { householdSession } from "#lib/household-session.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import { getTaskStore } from "#lib/task-store.js";
  import {
    dateKeyInTimeZone,
    setTaskCompleted,
    type DailyTask,
    type TaskDayPart,
  } from "#lib/tasks.js";
  import { getWeatherStore } from "#lib/weather-store.js";

  let { now, active = true }: { now: Date; active?: boolean } = $props();

  const VISIBLE_FORECAST_HOURS = 7;
  const weatherStore = getWeatherStore();
  const taskStore = getTaskStore();

  type DayPartWindow = {
    id: TaskDayPart;
    start: Date;
    end: Date;
    startMinutes: number;
    endMinutes: number;
    currentMinutes: number;
    dayStart: Date;
    dayEnd: Date;
  };

  type TimelineItem =
    | {
        kind: "task";
        key: string;
        sortMinutes: number;
        task: DailyTask;
      }
    | {
        kind: "event";
        key: string;
        sortMinutes: number;
        event: HouseholdCalendarEvent;
      };

  let calendarEvents = $state<HouseholdCalendarEvent[]>([]);
  let calendarLoading = $state(true);
  let taskActionError = $state("");
  let calendarError = $state("");
  let pendingCompletions = $state<string[]>([]);
  let calendarLoadKey = $state("");
  let calendarLoadGeneration = 0;
  let activationCount = 0;

  let text = $derived(translations[$appSettings.language]);
  let tasks = $derived($taskStore.tasks);
  let tasksLoading = $derived($taskStore.loading && tasks.length === 0);
  let tasksError = $derived(
    taskActionError ||
      ($taskStore.error ? text.tasks.loadErrorDescription : ""),
  );
  let locale = $derived(appLocale($appSettings.language));
  let hourlyForecast = $derived($weatherStore.hourly);
  let forecastUnavailable = $derived($weatherStore.unavailable);
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
  let todayKey = $derived(
    dateKeyInTimeZone(now, $appSettings.location.timezone),
  );
  let dayPart = $derived(
    currentDayPart(now, $appSettings.location.timezone),
  );
  let activeProfile = $derived(
    $appSettings.profiles.find((profile) => profile.id === $activeProfileId),
  );
  let visibleProfileIds = $derived(
    new Set(
      activeProfile?.family
        ? $appSettings.profiles.map((profile) => profile.id)
        : activeProfile
          ? [activeProfile.id]
          : [],
    ),
  );
  let profileById = $derived(
    new Map($appSettings.profiles.map((profile) => [profile.id, profile])),
  );
  let visibleTasks = $derived(
    tasks.filter(
      (task) =>
        !task.completed &&
        visibleProfileIds.has(task.profileId) &&
        taskBelongsToDayPart(task, dayPart),
    ).sort((first, second) => {
      const firstTime = first.dueTime ?? "99:99";
      const secondTime = second.dueTime ?? "99:99";
      return firstTime.localeCompare(secondTime) || first.title.localeCompare(second.title);
    }),
  );
  let visibleEvents = $derived(
    calendarEvents.filter(
      (event) =>
        visibleProfileIds.has(event.profileId) &&
        event.end > now &&
        event.end > dayPart.start &&
        event.start < dayPart.end,
    ),
  );
  let timelineItems = $derived.by(() => {
    const taskItems: TimelineItem[] = visibleTasks.map((task) => {
      const [hours, minutes] = task.dueTime?.split(":").map(Number) ?? [];
      const sortMinutes = Number.isFinite(hours) && Number.isFinite(minutes)
        ? hours * 60 + minutes
        : dayPart.currentMinutes - 1;

      return {
        kind: "task",
        key: `task:${task.id}:${task.profileId}`,
        sortMinutes,
        task,
      };
    });
    const eventItems: TimelineItem[] = visibleEvents.map((event) => {
      const eventStart = Temporal.Instant.fromEpochMilliseconds(
        event.start.getTime(),
      ).toZonedDateTimeISO($appSettings.location.timezone);

      return {
        kind: "event",
        key: `event:${event.id}`,
        sortMinutes: event.start <= now
          ? dayPart.currentMinutes - 2
          : eventStart.hour * 60 + eventStart.minute,
        event,
      };
    });

    return [...taskItems, ...eventItems].sort(
      (first, second) =>
        first.sortMinutes - second.sortMinutes || first.key.localeCompare(second.key),
    );
  });

  function currentDayPart(date: Date, timeZone: string): DayPartWindow {
    const zonedNow = Temporal.Instant.fromEpochMilliseconds(
      date.getTime(),
    ).toZonedDateTimeISO(timeZone);
    const dayStart = zonedNow.startOfDay();
    const dayEnd = dayStart.add({ days: 1 });
    const id: TaskDayPart =
      zonedNow.hour < 12
        ? "morning"
        : zonedNow.hour < 18
          ? "afternoon"
          : "evening";
    const startHours = id === "morning" ? 0 : id === "afternoon" ? 12 : 18;
    const endHours = id === "morning" ? 12 : id === "afternoon" ? 18 : 24;

    return {
      id,
      start: new Date(dayStart.add({ hours: startHours }).epochMilliseconds),
      end: new Date(dayStart.add({ hours: endHours }).epochMilliseconds),
      startMinutes: startHours * 60,
      endMinutes: endHours * 60,
      currentMinutes: zonedNow.hour * 60 + zonedNow.minute,
      dayStart: new Date(dayStart.epochMilliseconds),
      dayEnd: new Date(dayEnd.epochMilliseconds),
    };
  }

  function taskBelongsToDayPart(task: DailyTask, window: DayPartWindow) {
    if (task.kind === "routine") return task.dayPart === window.id;
    if (!task.dueTime) return true;

    const [hours, minutes] = task.dueTime.split(":").map(Number);
    const dueMinutes = hours * 60 + minutes;
    return dueMinutes >= window.startMinutes && dueMinutes < window.endMinutes;
  }

  function profileForTask(task: DailyTask): HouseholdProfile | undefined {
    return profileById.get(task.profileId);
  }

  function eventTime(event: HouseholdCalendarEvent) {
    if (event.allDay) return text.calendar.allDay;

    const formatter = new Intl.DateTimeFormat(
      appLocale($appSettings.language),
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: $appSettings.location.timezone,
      },
    );
    return `${formatter.format(event.start)}–${formatter.format(event.end)}`;
  }

  function eventIsOngoing(event: HouseholdCalendarEvent) {
    return !event.allDay && event.start <= now && event.end > now;
  }

  function taskTime(task: DailyTask) {
    return task.dueTime?.slice(0, 5) ?? text.tasks.now;
  }

  async function loadCalendar(showLoader = false) {
    const generation = ++calendarLoadGeneration;
    const settings = get(appSettings);
    const window = currentDayPart(now, settings.location.timezone);
    if (showLoader) calendarLoading = true;
    calendarError = "";

    try {
      const events = await getHouseholdCalendarEvents(
        settings.profiles,
        window.dayStart,
        window.dayEnd,
        settings.location.timezone,
      );
      if (generation === calendarLoadGeneration) calendarEvents = events;
    } catch (error) {
      console.error("Unable to load calendar events for home", error);
      if (generation === calendarLoadGeneration) {
        calendarError = text.home.calendarError;
      }
    } finally {
      if (generation === calendarLoadGeneration) calendarLoading = false;
    }
  }

  async function completeTask(task: DailyTask) {
    const session = get(householdSession);
    if (!session.household) return;

    const key = `${task.id}:${task.profileId}`;
    taskActionError = "";
    pendingCompletions = [...pendingCompletions, key];
    taskStore.setCompleted(task.id, task.profileId, true);

    try {
      await setTaskCompleted(
        session.household.id,
        task.id,
        task.profileId,
        todayKey,
        true,
      );
    } catch (error) {
      console.error("Unable to complete task from home", error);
      taskStore.setCompleted(task.id, task.profileId, false);
      taskActionError = text.tasks.completeError;
    } finally {
      pendingCompletions = pendingCompletions.filter((item) => item !== key);
    }
  }

  $effect(() => {
    if (!active) return;

    const householdId = $householdSession.household?.id;
    if (typeof window === "undefined" || !householdId) return;
    taskStore.ensure(householdId, todayKey);
  });

  $effect(() => {
    if (!active) return;

    const nextLoadKey = JSON.stringify({
      date: todayKey,
      timezone: $appSettings.location.timezone,
      profiles: $appSettings.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        color: profile.color,
        calendars: profile.calendars,
      })),
    });
    if (
      typeof window === "undefined" ||
      nextLoadKey === calendarLoadKey
    ) {
      return;
    }

    calendarLoadKey = nextLoadKey;
    void loadCalendar(true);
  });

  $effect(() => {
    const householdId = $householdSession.household?.id;
    if (!active || typeof window === "undefined" || !householdId) return;

    if (activationCount > 0) {
      void loadCalendar();
    }
    activationCount += 1;

    const refreshCalendar = window.setInterval(
      () => void loadCalendar(),
      CALENDAR_REFRESH_INTERVAL + 5_000,
    );

    return () => {
      calendarLoadGeneration += 1;
      window.clearInterval(refreshCalendar);
    };
  });
</script>

<div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-muted/30 p-3 md:gap-4 md:p-6">
  <Card.Root size="sm" class="hidden shrink-0 py-0 md:flex">
    <ScrollArea.Root orientation="horizontal" class="w-full" viewportClass="w-full">
      {#if visibleForecast.length > 0}
        <div class="grid min-w-[52rem] grid-cols-7 divide-x">
          {#each visibleForecast as forecast}
            {@const forecastTime = forecast.time.slice(11, 16)}
            <div
              class="flex min-w-0 items-center justify-center gap-2 px-3 py-3"
              aria-label={`${forecastTime}, ${forecast.description}, ${Math.round(forecast.temperature)} ${text.weather.degrees}, ${forecast.precipitationProbability}% ${text.weather.precipitation}, ${Math.round(forecast.windSpeed)} ${forecast.windUnit} ${text.weather.wind}`}
            >
              <WeatherIcon
                kind={forecast.kind}
                isDay={forecast.isDay}
                class="size-7 shrink-0"
              />
              <div class="grid min-w-0 gap-0.5">
                <time class="text-xs tabular-nums text-muted-foreground" datetime={forecast.time}>
                  {forecastTime}
                </time>
                <div class="flex items-center gap-2">
                  <strong class="text-base leading-none tabular-nums">
                    {Math.round(forecast.temperature)}°
                  </strong>
                  <span class="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Droplets class="size-3" aria-hidden="true" />
                    {forecast.precipitationProbability}%
                  </span>
                </div>
                <span class="flex items-center gap-1 text-xs text-muted-foreground">
                  <Wind class="size-3" aria-hidden="true" />
                  {Math.round(forecast.windSpeed)} {forecast.windUnit}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {:else if forecastUnavailable}
        <div class="grid h-16 place-items-center px-4 text-sm text-muted-foreground">
          {text.weather.unavailable}
        </div>
      {:else}
        <div class="grid min-w-[52rem] grid-cols-7 gap-3 p-3" aria-label={text.weather.loading}>
          {#each Array(VISIBLE_FORECAST_HOURS) as _}
            <Skeleton class="h-10 w-full" />
          {/each}
        </div>
      {/if}
    </ScrollArea.Root>
  </Card.Root>

  <Card.Root size="sm" class="min-h-0 flex-1 overflow-hidden py-0">
    <Card.Header class="border-b py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <Clock3 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div class="min-w-0">
            <Card.Title class="text-sm">{text.home.timeline}</Card.Title>
            <Card.Description class="text-xs">{text.tasks[dayPart.id]}</Card.Description>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Badge variant="secondary" class="gap-1">
            <ListChecks class="size-3" aria-hidden="true" />
            {visibleTasks.length}
            <span class="sr-only">{text.home.tasksShort}</span>
          </Badge>
          <Badge variant="secondary" class="gap-1">
            <CalendarDays class="size-3" aria-hidden="true" />
            {visibleEvents.length}
            <span class="sr-only">{text.home.calendarShort}</span>
          </Badge>
        </div>
      </div>
    </Card.Header>

    <ScrollArea.Root class="min-h-0 flex-1">
      <Card.Content class="grid gap-2 py-3">
        {#if tasksError}
          <Alert.Root variant="destructive">
            <Alert.Title>{text.tasks.loadError}</Alert.Title>
            <Alert.Description>{tasksError}</Alert.Description>
          </Alert.Root>
        {/if}
        {#if calendarError}
          <Alert.Root variant="destructive">
            <Alert.Title>{text.home.calendarLoadError}</Alert.Title>
            <Alert.Description>{calendarError}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if (tasksLoading || calendarLoading) && timelineItems.length === 0}
          {#each Array(4) as _}
            <div class="flex items-center gap-3 rounded-md border p-3">
              <Skeleton class="h-4 w-14" />
              <Skeleton class="size-5 rounded-sm" />
              <div class="grid flex-1 gap-2">
                <Skeleton class="h-4 w-2/3" />
                <Skeleton class="h-3 w-1/3" />
              </div>
            </div>
          {/each}
        {:else if timelineItems.length === 0 && !tasksError && !calendarError}
          <div class="grid min-h-48 place-items-center text-center">
            <div>
              <Clock3 class="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
              <p class="text-sm font-medium">{text.home.allClear}</p>
              <p class="mt-1 text-xs text-muted-foreground">{text.home.noTimeline}</p>
            </div>
          </div>
        {:else}
          {#each timelineItems as item (item.key)}
            {#if item.kind === "task"}
              {@const task = item.task}
              {@const profile = profileForTask(task)}
              {@const completionKey = `${task.id}:${task.profileId}`}
              <label class="grid min-h-14 cursor-pointer grid-cols-[4rem_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors hover:bg-accent/50">
                <time class="text-xs font-medium tabular-nums text-muted-foreground">
                  {taskTime(task)}
                </time>
                <Checkbox
                  checked={false}
                  disabled={pendingCompletions.includes(completionKey)}
                  onCheckedChange={(checked) => {
                    if (checked === true) void completeTask(task);
                  }}
                  aria-label={`${task.title} ${text.tasks.completed}`}
                />
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="text-lg" aria-hidden="true">{task.emoji || "✓"}</span>
                  <span class="min-w-0">
                    <strong class="block truncate text-sm">{task.title}</strong>
                    <span class="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      {#if task.kind === "routine"}
                        <Repeat2 class="size-3 shrink-0" aria-hidden="true" />
                        {text.tasks.routine}
                      {:else}
                        <ListChecks class="size-3 shrink-0" aria-hidden="true" />
                        {text.tasks.chore}
                      {/if}
                      {#if profile} · {profile.name}{/if}
                    </span>
                  </span>
                </span>
                {#if profile}
                  <ProfileAvatar name={profile.name} color={profile.color} size="sm" />
                {/if}
              </label>
            {:else}
              {@const event = item.event}
              <div class="grid min-h-14 grid-cols-[4rem_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-background px-3 py-2">
                <div class="min-w-0 text-xs font-medium text-muted-foreground">
                  {#if eventIsOngoing(event)}
                    <Badge variant="secondary" class="px-1.5 py-0">{text.tasks.now}</Badge>
                  {:else}
                    <span class="tabular-nums">{eventTime(event)}</span>
                  {/if}
                </div>
                <span
                  class="h-8 w-1 shrink-0 rounded-full"
                  style:background-color={event.profileColor}
                  aria-hidden="true"
                ></span>
                <div class="min-w-0">
                  <strong class="block truncate text-sm">{event.title}</strong>
                  <span class="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <CalendarDays class="size-3 shrink-0" aria-hidden="true" />
                    {eventIsOngoing(event) ? `${eventTime(event)} · ` : ""}{event.profileName} · {event.calendarName}
                    {#if event.location}
                      <MapPin class="ml-1 size-3 shrink-0" aria-hidden="true" />
                      {event.location}
                    {/if}
                  </span>
                </div>
                <ProfileAvatar
                  name={event.profileName}
                  color={event.profileColor}
                  size="sm"
                />
              </div>
            {/if}
          {/each}
        {/if}
      </Card.Content>
    </ScrollArea.Root>
  </Card.Root>
</div>
