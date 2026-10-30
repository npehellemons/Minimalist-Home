<script lang="ts">
  import {
    CalendarDays,
    ChartNoAxesColumnIncreasing,
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
  import { Progress } from "#lib/components/ui/progress/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import WeatherIcon from "#lib/components/weather-icon.svelte";
  import { householdSession } from "#lib/household-session.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import { getTaskStore } from "#lib/task-store.js";
  import {
    dateKeyInTimeZone,
    setTaskOccurrenceStatus,
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
  let progressTasks = $derived(
    tasks.filter(
      (task) => visibleProfileIds.has(task.profileId) && !task.skipped,
    ),
  );
  let completedTaskCount = $derived(
    progressTasks.filter((task) => task.completed).length,
  );
  let completionPercentage = $derived(
    progressTasks.length > 0
      ? Math.round((completedTaskCount / progressTasks.length) * 100)
      : 0,
  );
  let profileProgress = $derived.by(() =>
    $appSettings.profiles
      .filter((profile) => visibleProfileIds.has(profile.id))
      .map((profile) => {
        const profileTasks = progressTasks.filter(
          (task) => task.profileId === profile.id,
        );
        const completed = profileTasks.filter((task) => task.completed).length;

        return {
          profile,
          completed,
          total: profileTasks.length,
          percentage:
            profileTasks.length > 0
              ? Math.round((completed / profileTasks.length) * 100)
              : 0,
        };
      })
      .filter((entry) => entry.total > 0),
  );
  let visibleTasks = $derived(
    tasks.filter(
      (task) =>
        task.status === "pending" &&
        visibleProfileIds.has(task.profileId) &&
        taskIsCurrentOrUpcoming(task, dayPart),
    ).sort((first, second) => {
      return (
        taskSortMinutes(first, dayPart) - taskSortMinutes(second, dayPart) ||
        first.title.localeCompare(second.title)
      );
    }),
  );
  let visibleEvents = $derived(
    calendarEvents.filter(
      (event) =>
        visibleProfileIds.has(event.profileId) &&
        event.end > now &&
        event.start < dayPart.dayEnd,
    ),
  );
  let timelineItems = $derived.by(() => {
    const taskItems: TimelineItem[] = visibleTasks.map((task) => {
      return {
        kind: "task",
        key: `task:${task.id}:${task.profileId}:${task.occurrenceDate}`,
        sortMinutes: taskSortMinutes(task, dayPart),
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

  function dayPartStartMinutes(dayPart: TaskDayPart | null) {
    if (dayPart === "afternoon") return 12 * 60;
    if (dayPart === "evening") return 18 * 60;
    return 0;
  }

  function dueTimeMinutes(dueTime: string | null) {
    if (!dueTime) return null;

    const [hours, minutes] = dueTime.split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes)
      ? hours * 60 + minutes
      : null;
  }

  function taskIsCurrentOrUpcoming(task: DailyTask, window: DayPartWindow) {
    return task.occurrenceDate <= todayKey && window.dayEnd > now;
  }

  function taskSortMinutes(task: DailyTask, window: DayPartWindow) {
    if (task.kind === "routine") {
      const startMinutes = dayPartStartMinutes(task.dayPart);
      if (startMinutes < window.startMinutes) return window.startMinutes - 2;
      return startMinutes === window.startMinutes
        ? window.currentMinutes - 1
        : startMinutes;
    }

    if (task.overdue) return window.startMinutes - 3;
    const dueMinutes = dueTimeMinutes(task.dueTime);
    if (dueMinutes === null || dueMinutes <= window.currentMinutes) {
      return window.currentMinutes - 1;
    }
    return dueMinutes;
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
    if (task.overdue) return text.tasks.overdue;
    if (
      task.kind === "routine" &&
      task.dayPart &&
      task.dayPart !== dayPart.id
    ) {
      return dayPartStartMinutes(task.dayPart) < dayPart.startMinutes
        ? `${text.tasks[task.dayPart]} · ${text.tasks.earlierOpen}`
        : text.tasks[task.dayPart];
    }
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

    const key = `${task.id}:${task.profileId}:${task.occurrenceDate}`;
    taskActionError = "";
    pendingCompletions = [...pendingCompletions, key];
    taskStore.setStatus(task.id, task.profileId, task.occurrenceDate, "completed");

    try {
      await setTaskOccurrenceStatus(
        session.household.id,
        task.id,
        task.profileId,
        task.occurrenceDate,
        "completed",
        todayKey,
      );
    } catch (error) {
      console.error("Unable to complete task from home", error);
      taskStore.setStatus(task.id, task.profileId, task.occurrenceDate, "pending");
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

  <div
    class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] md:grid-rows-1 md:gap-4"
  >
    <Card.Root
      size="sm"
      class="order-2 min-h-0 overflow-hidden py-0 md:order-1"
    >
      <Card.Header class="border-b py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <Clock3
              class="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <Card.Title class="text-sm">{text.home.timeline}</Card.Title>
              <Card.Description class="text-xs">
                {text.tasks[dayPart.id]} · {text.home.restOfToday}
              </Card.Description>
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
              {@const completionKey = `${task.id}:${task.profileId}:${task.occurrenceDate}`}
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

  <Card.Root size="sm" class="order-1 shrink-0 py-0 md:order-2 md:min-h-0 md:overflow-hidden">
    <Card.Header class="border-b py-3">
      <div class="flex items-center gap-2.5">
        <ChartNoAxesColumnIncreasing class="size-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <Card.Title class="text-sm">{text.home.progress}</Card.Title>
          <Card.Description class="text-xs">{text.home.today}</Card.Description>
        </div>
      </div>
    </Card.Header>
    <Card.Content class="grid gap-3 py-3 md:gap-5 md:py-5">
      {#if tasksLoading && progressTasks.length === 0}
        <Skeleton class="h-16 w-full" />
      {:else}
        <div class="grid gap-2">
          <div class="flex items-end justify-between gap-3">
            <strong class="text-3xl leading-none tabular-nums">{completionPercentage}%</strong>
            <span class="text-xs text-muted-foreground">
              {completedTaskCount} / {progressTasks.length} {text.home.completed}
            </span>
          </div>
          <Progress
            value={completionPercentage}
            class="h-2"
            aria-label={text.home.progress}
          />
        </div>

        <div class="hidden gap-4 md:grid">
          {#if profileProgress.length > 0}
            {#each profileProgress as entry (entry.profile.id)}
              <div class="grid gap-2">
                <div class="flex items-center gap-2">
                  <ProfileAvatar
                    name={entry.profile.name}
                    color={entry.profile.color}
                    size="sm"
                  />
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">
                    {entry.profile.name}
                  </span>
                  <span class="text-xs tabular-nums text-muted-foreground">
                    {entry.completed}/{entry.total}
                  </span>
                </div>
                <div style:--primary={entry.profile.color}>
                  <Progress
                    value={entry.percentage}
                    aria-label={`${entry.profile.name}: ${entry.percentage}%`}
                  />
                </div>
              </div>
            {/each}
          {:else}
            <p class="text-sm text-muted-foreground">{text.home.noProgress}</p>
          {/if}
        </div>
      {/if}
    </Card.Content>
    </Card.Root>
  </div>
</div>
