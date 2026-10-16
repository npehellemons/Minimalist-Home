<script lang="ts">
  import { CalendarDays, ListChecks, Repeat2 } from "@lucide/svelte";
  import { onMount } from "svelte";
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
  import { householdSession } from "#lib/household-session.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import {
    dateKeyInTimeZone,
    getDailyTasks,
    setTaskCompleted,
    subscribeToTasks,
    type DailyTask,
    type TaskDayPart,
  } from "#lib/tasks.js";

  let { now }: { now: Date } = $props();

  type DayPartWindow = {
    id: TaskDayPart;
    start: Date;
    end: Date;
    startMinutes: number;
    endMinutes: number;
    dayStart: Date;
    dayEnd: Date;
  };

  let tasks = $state<DailyTask[]>([]);
  let calendarEvents = $state<HouseholdCalendarEvent[]>([]);
  let tasksLoading = $state(true);
  let calendarLoading = $state(true);
  let tasksError = $state("");
  let calendarError = $state("");
  let pendingCompletions = $state<string[]>([]);
  let taskLoadKey = $state("");
  let calendarLoadKey = $state("");
  let taskLoadGeneration = 0;
  let calendarLoadGeneration = 0;

  let text = $derived(translations[$appSettings.language]);
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

  async function loadTasks(showLoader = false) {
    const session = get(householdSession);
    if (!session.household) return;

    const generation = ++taskLoadGeneration;
    if (showLoader) tasksLoading = true;
    tasksError = "";

    try {
      const nextTasks = await getDailyTasks(session.household.id, todayKey);
      if (generation === taskLoadGeneration) tasks = nextTasks;
    } catch (error) {
      console.error("Unable to load tasks for home", error);
      if (generation === taskLoadGeneration) {
        tasksError = text.tasks.loadErrorDescription;
      }
    } finally {
      if (generation === taskLoadGeneration) tasksLoading = false;
    }
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
    pendingCompletions = [...pendingCompletions, key];
    tasks = tasks.map((candidate) =>
      candidate.id === task.id && candidate.profileId === task.profileId
        ? { ...candidate, completed: true }
        : candidate,
    );

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
      tasks = tasks.map((candidate) =>
        candidate.id === task.id && candidate.profileId === task.profileId
          ? { ...candidate, completed: false }
          : candidate,
      );
      tasksError = text.tasks.completeError;
    } finally {
      pendingCompletions = pendingCompletions.filter((item) => item !== key);
    }
  }

  $effect(() => {
    const householdId = $householdSession.household?.id;
    const nextLoadKey = householdId ? `${householdId}:${todayKey}` : "";
    if (typeof window === "undefined" || !nextLoadKey || nextLoadKey === taskLoadKey) {
      return;
    }

    taskLoadKey = nextLoadKey;
    void loadTasks(true);
  });

  $effect(() => {
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

  onMount(() => {
    const session = get(householdSession);
    const unsubscribeTasks = session.household
      ? subscribeToTasks(session.household.id, () => void loadTasks())
      : () => undefined;
    const refreshCalendar = window.setInterval(
      () => void loadCalendar(),
      CALENDAR_REFRESH_INTERVAL + 5_000,
    );

    return () => {
      taskLoadGeneration += 1;
      calendarLoadGeneration += 1;
      unsubscribeTasks();
      window.clearInterval(refreshCalendar);
    };
  });
</script>

<div class="h-full min-h-0 bg-muted/30 p-3 md:p-6">
  <div class="grid h-full min-h-0 gap-3 md:grid-cols-2 md:gap-6">
    <Card.Root class="min-h-0">
      <Card.Header class="border-b">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <ListChecks class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div class="min-w-0">
              <Card.Title>{text.home.tasks}</Card.Title>
              <Card.Description>{text.tasks[dayPart.id]}</Card.Description>
            </div>
          </div>
          <Badge variant="secondary">{visibleTasks.length}</Badge>
        </div>
      </Card.Header>

      <ScrollArea.Root class="max-h-[19rem] min-h-0 flex-1 md:max-h-none">
        <Card.Content class="grid gap-2">
          {#if tasksLoading}
            {#each Array(3) as _}
              <div class="flex items-center gap-3 rounded-lg border p-3">
                <Skeleton class="size-5 rounded-sm" />
                <div class="grid flex-1 gap-2">
                  <Skeleton class="h-4 w-2/3" />
                  <Skeleton class="h-3 w-1/3" />
                </div>
              </div>
            {/each}
          {:else if tasksError}
            <Alert.Root variant="destructive">
              <Alert.Title>{text.tasks.loadError}</Alert.Title>
              <Alert.Description>{tasksError}</Alert.Description>
            </Alert.Root>
          {:else if visibleTasks.length === 0}
            <p class="py-12 text-center text-sm text-muted-foreground">
              {text.home.noTasks}
            </p>
          {:else}
            {#each visibleTasks as task (`${task.id}:${task.profileId}`)}
              {@const profile = profileForTask(task)}
              {@const completionKey = `${task.id}:${task.profileId}`}
              <label class="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent/50">
                <Checkbox
                  checked={false}
                  disabled={pendingCompletions.includes(completionKey)}
                  onCheckedChange={(checked) => {
                    if (checked === true) void completeTask(task);
                  }}
                  aria-label={`${task.title} ${text.tasks.completed}`}
                />
                <span class="text-xl" aria-hidden="true">{task.emoji || "✓"}</span>
                <span class="min-w-0 flex-1">
                  <strong class="block truncate text-sm">{task.title}</strong>
                  <span class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {#if task.kind === "routine"}
                      <Repeat2 class="size-3" aria-hidden="true" />
                      {text.tasks.routine}
                    {:else}
                      <ListChecks class="size-3" aria-hidden="true" />
                      {task.dueTime?.slice(0, 5) ?? text.tasks.chore}
                    {/if}
                    {#if profile}
                      · {profile.name}
                    {/if}
                  </span>
                </span>
                {#if profile}
                  <ProfileAvatar name={profile.name} color={profile.color} size="sm" />
                {/if}
              </label>
            {/each}
          {/if}
        </Card.Content>
      </ScrollArea.Root>
    </Card.Root>

    <Card.Root class="min-h-0">
      <Card.Header class="border-b">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <CalendarDays class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div class="min-w-0">
              <Card.Title>{text.home.calendar}</Card.Title>
              <Card.Description>{text.tasks[dayPart.id]}</Card.Description>
            </div>
          </div>
          <Badge variant="secondary">{visibleEvents.length}</Badge>
        </div>
      </Card.Header>

      <ScrollArea.Root class="max-h-[19rem] min-h-0 flex-1 md:max-h-none">
        <Card.Content class="grid gap-2">
          {#if calendarLoading}
            {#each Array(3) as _}
              <div class="flex items-center gap-3 rounded-lg border p-3">
                <Skeleton class="h-10 w-14" />
                <div class="grid flex-1 gap-2">
                  <Skeleton class="h-4 w-2/3" />
                  <Skeleton class="h-3 w-1/3" />
                </div>
              </div>
            {/each}
          {:else if calendarError}
            <Alert.Root variant="destructive">
              <Alert.Title>{text.home.calendarLoadError}</Alert.Title>
              <Alert.Description>{calendarError}</Alert.Description>
            </Alert.Root>
          {:else if visibleEvents.length === 0}
            <p class="py-12 text-center text-sm text-muted-foreground">
              {text.home.noCalendar}
            </p>
          {:else}
            {#each visibleEvents as event (event.id)}
              <div class="flex min-h-16 items-center gap-3 rounded-lg border bg-background p-3">
                <div class="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                  {eventTime(event)}
                </div>
                <span
                  class="h-10 w-1 shrink-0 rounded-full"
                  style:background-color={event.profileColor}
                  aria-hidden="true"
                ></span>
                <div class="min-w-0 flex-1">
                  <strong class="block truncate text-sm">{event.title}</strong>
                  <span class="mt-1 block truncate text-xs text-muted-foreground">
                    {event.profileName} · {event.calendarName}
                  </span>
                </div>
                <ProfileAvatar
                  name={event.profileName}
                  color={event.profileColor}
                  size="sm"
                />
              </div>
            {/each}
          {/if}
        </Card.Content>
      </ScrollArea.Root>
    </Card.Root>
  </div>
</div>
