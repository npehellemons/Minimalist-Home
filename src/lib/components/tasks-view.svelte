<script lang="ts">
  import { EllipsisVertical, ListChecks, Plus, Repeat2 } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { get } from "svelte/store";

  import {
    activeProfileId,
    appSettings,
    type HouseholdProfile,
  } from "#lib/app-settings.js";
  import ProfileAvatar from "#lib/components/profile-avatar.svelte";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { householdSession } from "#lib/household-session.js";
  import { translations } from "#lib/i18n.js";
  import {
    createTask,
    dateKeyInTimeZone,
    deleteTask,
    getDailyTasks,
    setTaskCompleted,
    subscribeToTasks,
    updateTask,
    type DailyTask,
    type ChoreRecurrence,
    type TaskDayPart,
    type TaskKind,
  } from "#lib/tasks.js";

  type DayBlock = {
    id: TaskDayPart;
    range: string;
  };

  type RoutineFrequency = "daily" | "selected-days";

  const weekdays = [
    { id: "monday", value: 1 },
    { id: "tuesday", value: 2 },
    { id: "wednesday", value: 3 },
    { id: "thursday", value: 4 },
    { id: "friday", value: 5 },
    { id: "saturday", value: 6 },
    { id: "sunday", value: 0 },
  ] as const;
  const everyDay = weekdays.map((day) => day.value);

  const dayBlocks: DayBlock[] = [
    { id: "morning", range: "00:00 - 12:00" },
    { id: "afternoon", range: "12:00 - 18:00" },
    { id: "evening", range: "18:00 - 00:00" },
  ];

  function currentDayBlock(date: Date, timeZone: string): TaskDayPart {
    const hour = Number(
      new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone,
      }).format(date),
    );

    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  }

  function sortedTasks(tasks: DailyTask[]) {
    return [...tasks].sort((first, second) => {
      if (first.completed !== second.completed) {
        return Number(first.completed) - Number(second.completed);
      }
      if (first.kind !== second.kind) return first.kind === "routine" ? -1 : 1;
      return first.title.localeCompare(second.title);
    });
  }

  function completedCount(tasks: DailyTask[]) {
    return tasks.filter((task) => task.completed).length;
  }

  const initialNow = new Date();
  const initialSettings = get(appSettings);
  const initialBlock = currentDayBlock(
    initialNow,
    initialSettings.location.timezone,
  );
  let now = $state(initialNow);
  let selectedBlockId = $state<TaskDayPart>(initialBlock);
  let tasks = $state<DailyTask[]>([]);
  let loading = $state(true);
  let loadError = $state("");
  let pendingCompletions = $state<string[]>([]);
  let createOpen = $state(false);
  let creating = $state(false);
  let createError = $state("");
  let editingTaskId = $state<string | null>(null);
  let taskTitle = $state("");
  let taskEmoji = $state("");
  let taskKind = $state<TaskKind>("routine");
  let taskDayPart = $state<TaskDayPart>(initialBlock);
  let routineFrequency = $state<RoutineFrequency>("daily");
  let taskWeekdays = $state<number[]>([...everyDay]);
  let taskDueDate = $state(
    dateKeyInTimeZone(initialNow, initialSettings.location.timezone),
  );
  let taskDueTime = $state("");
  let choreRecurrence = $state<ChoreRecurrence>("none");
  let selectedProfileIds = $state<string[]>([]);
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let deleteError = $state("");
  let taskToDelete = $state<DailyTask | null>(null);

  let text = $derived(translations[$appSettings.language]);
  let activeBlockId = $derived(
    currentDayBlock(now, $appSettings.location.timezone),
  );
  let selectedBlock = $derived(
    dayBlocks.find((block) => block.id === selectedBlockId) ?? dayBlocks[0],
  );
  let todayKey = $derived(
    dateKeyInTimeZone(now, $appSettings.location.timezone),
  );
  let selectedProfileIsFamily = $derived(
    $appSettings.profiles.find((profile) => profile.id === $activeProfileId)
      ?.family === true,
  );
  let visibleProfiles = $derived(
    selectedProfileIsFamily
      ? $appSettings.profiles
      : $appSettings.profiles.filter((profile) => profile.id === $activeProfileId),
  );
  let profileCardBasis = $derived(
    visibleProfiles.length <= 1
      ? "100%"
      : visibleProfiles.length === 2
        ? "calc((100% - 1rem) / 2)"
        : "calc((100% - 2rem) / 3)",
  );
  let routineScheduleIsValid = $derived(
    taskKind !== "routine" ||
      routineFrequency === "daily" ||
      taskWeekdays.length > 0,
  );

  function tasksForProfile(profile: HouseholdProfile) {
    return tasks.filter(
      (task) =>
        task.profileId === profile.id &&
        (task.kind === "chore" || task.dayPart === selectedBlockId),
    );
  }

  async function loadTasks(showLoader = false) {
    const session = get(householdSession);
    if (!session.household) return;

    if (showLoader) loading = true;
    loadError = "";

    try {
      tasks = await getDailyTasks(session.household.id, todayKey);
    } catch (error) {
      console.error("Unable to load household tasks", error);
      loadError = text.tasks.loadErrorDescription;
    } finally {
      loading = false;
    }
  }

  function openCreateTask() {
    const profiles = get(appSettings).profiles;
    const activeId = get(activeProfileId);
    const defaultProfile =
      profiles.find((profile) => profile.id === activeId) ?? profiles[0];

    taskTitle = "";
    taskEmoji = "";
    taskKind = "routine";
    taskDayPart = selectedBlockId;
    routineFrequency = "daily";
    taskWeekdays = [...everyDay];
    taskDueDate = todayKey;
    taskDueTime = "";
    choreRecurrence = "none";
    selectedProfileIds = defaultProfile ? [defaultProfile.id] : [];
    createError = "";
    editingTaskId = null;
    createOpen = true;
  }

  function openEditTask(task: DailyTask) {
    const schedule = task.weekdays ?? [];

    taskTitle = task.title;
    taskEmoji = task.emoji ?? "";
    taskKind = task.kind;
    taskDayPart = task.dayPart ?? selectedBlockId;
    routineFrequency = schedule.length === everyDay.length ? "daily" : "selected-days";
    taskWeekdays = [...schedule];
    taskDueDate = task.dueDate ?? todayKey;
    taskDueTime = task.dueTime?.slice(0, 5) ?? "";
    choreRecurrence = task.recurrence;
    selectedProfileIds = tasks
      .filter((candidate) => candidate.id === task.id)
      .map((candidate) => candidate.profileId);
    createError = "";
    editingTaskId = task.id;
    createOpen = true;
  }

  function toggleProfile(profileId: string, checked: boolean) {
    selectedProfileIds = checked
      ? [...new Set([...selectedProfileIds, profileId])]
      : selectedProfileIds.filter((id) => id !== profileId);
  }

  function toggleWeekday(weekday: number) {
    taskWeekdays = taskWeekdays.includes(weekday)
      ? taskWeekdays.filter((day) => day !== weekday)
      : [...taskWeekdays, weekday];
  }

  async function submitTask(event: SubmitEvent) {
    event.preventDefault();
    const session = get(householdSession);
    if (
      !session.household ||
      !taskTitle.trim() ||
      selectedProfileIds.length === 0 ||
      !routineScheduleIsValid
    ) {
      return;
    }

    creating = true;
    createError = "";

    try {
      const taskInput = {
        householdId: session.household.id,
        title: taskTitle,
        emoji: taskEmoji,
        kind: taskKind,
        profileIds: selectedProfileIds,
        dayPart: taskDayPart,
        weekdays:
          routineFrequency === "daily" ? [...everyDay] : taskWeekdays,
        dueDate: taskDueDate,
        dueTime: taskDueTime,
        recurrence: choreRecurrence,
      };

      if (editingTaskId) {
        await updateTask({ ...taskInput, taskId: editingTaskId });
      } else {
        await createTask(taskInput);
      }
      createOpen = false;
      await loadTasks();
    } catch (error) {
      console.error("Unable to save household task", error);
      createError = editingTaskId
        ? text.tasks.updateErrorDescription
        : text.tasks.createErrorDescription;
    } finally {
      creating = false;
    }
  }

  async function toggleTask(task: DailyTask, completed: boolean) {
    const session = get(householdSession);
    if (!session.household) return;

    const pendingKey = `${task.id}\u0000${task.profileId}`;
    const previous = task.completed;
    task.completed = completed;
    pendingCompletions = [...pendingCompletions, pendingKey];

    try {
      await setTaskCompleted(
        session.household.id,
        task.id,
        task.profileId,
        todayKey,
        completed,
      );
    } catch {
      task.completed = previous;
      loadError = text.tasks.completeError;
    } finally {
      pendingCompletions = pendingCompletions.filter((key) => key !== pendingKey);
    }
  }

  function openDeleteTask(task: DailyTask) {
    taskToDelete = task;
    deleteError = "";
    deleteOpen = true;
  }

  async function confirmDeleteTask(event: MouseEvent) {
    event.preventDefault();
    const session = get(householdSession);
    if (!session.household || !taskToDelete) return;

    deleting = true;
    deleteError = "";

    try {
      const taskId = taskToDelete.id;
      await deleteTask(session.household.id, taskId);
      tasks = tasks.filter((task) => task.id !== taskId);
      deleteOpen = false;
      taskToDelete = null;
    } catch (error) {
      console.error("Unable to remove household task", error);
      deleteError = text.tasks.removeErrorDescription;
    } finally {
      deleting = false;
    }
  }

  onMount(() => {
    let refreshTimeout: number | undefined;
    let unsubscribe = () => {};
    const session = get(householdSession);

    void loadTasks(true);

    if (session.household) {
      unsubscribe = subscribeToTasks(session.household.id, () => {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = window.setTimeout(() => void loadTasks(), 120);
      });
    }

    const clockInterval = window.setInterval(() => {
      const previousDayKey = dateKeyInTimeZone(
        now,
        $appSettings.location.timezone,
      );
      const previousActiveBlock = currentDayBlock(
        now,
        $appSettings.location.timezone,
      );
      const nextNow = new Date();

      now = nextNow;

      if (selectedBlockId === previousActiveBlock) {
        selectedBlockId = currentDayBlock(
          nextNow,
          $appSettings.location.timezone,
        );
      }

      if (
        previousDayKey !==
        dateKeyInTimeZone(nextNow, $appSettings.location.timezone)
      ) {
        void loadTasks();
      }
    }, 60_000);

    return () => {
      window.clearInterval(clockInterval);
      window.clearTimeout(refreshTimeout);
      unsubscribe();
    };
  });
</script>

<div class="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-background">
  <div class="flex shrink-0 flex-col gap-3 border-b p-3 md:h-20 md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
    <div class="grid gap-1">
      <p class="text-sm font-medium text-muted-foreground">
        {#if selectedBlock.id === activeBlockId}{text.tasks.now} ·
        {/if}{selectedBlock.range}
      </p>
      <h2 class="text-2xl font-semibold">{text.tasks[selectedBlock.id]}</h2>
    </div>

    <div class="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between md:w-auto md:justify-end md:gap-3">
      <ScrollArea.Root orientation="horizontal" class="min-w-0">
        <div class="flex w-max items-center gap-1.5 pr-2">
          {#each visibleProfiles as profile (profile.id)}
            <Badge variant="outline" class="gap-1.5 font-normal">
              <span
                class="size-2.5 rounded-full"
                style={`background-color: ${profile.color}`}
                aria-hidden="true"
              ></span>
              {profile.name}
            </Badge>
          {/each}
        </div>
      </ScrollArea.Root>

      <div class="flex shrink-0 items-center gap-2">
        <div
          class="grid h-10 grid-cols-3 items-center rounded-lg bg-muted/30 p-1"
          role="group"
          aria-label={text.tasks.block}
        >
          {#each dayBlocks as block}
            <Button
              variant={selectedBlockId === block.id ? "default" : "ghost"}
              size="sm"
              class="h-8"
              aria-pressed={selectedBlockId === block.id}
              onclick={() => (selectedBlockId = block.id)}
            >
              {text.tasks[block.id]}
            </Button>
          {/each}
        </div>

        <Button size="icon" aria-label={text.tasks.add} onclick={openCreateTask}>
          <Plus />
        </Button>
      </div>
    </div>
  </div>

  {#if loadError}
    <Alert.Root variant="destructive" class="m-4 mb-0 shrink-0">
      <Alert.Title>{text.tasks.loadError}</Alert.Title>
      <Alert.Description>{loadError}</Alert.Description>
    </Alert.Root>
  {/if}

  <ScrollArea.Root
    orientation="horizontal"
    viewportClass="snap-x snap-mandatory scroll-smooth"
    class="min-h-0 min-w-0 w-full flex-1 bg-muted/30"
  >
    <div class="flex h-full min-w-full md:gap-4 md:p-4">
      {#each visibleProfiles as profile (profile.id)}
        {@const profileTasks = tasksForProfile(profile)}
        {@const completed = completedCount(profileTasks)}
        <div
          class="h-full w-full min-w-0 shrink-0 snap-center p-4 md:w-auto md:snap-none md:basis-[var(--profile-card-basis)] md:p-0"
          style={`--profile-card-basis: ${profileCardBasis}`}
        >
          <Card.Root
            class="h-full min-h-0 min-w-0 gap-0 rounded-lg py-0"
            size="sm"
            role="region"
            aria-label={`${text.tasks.for} ${profile.name}`}
          >
            <Card.Header class="flex min-h-16 shrink-0 flex-row items-center justify-between border-b px-4 pt-(--card-spacing)">
              <div class="flex min-w-0 items-center gap-3">
                <ProfileAvatar name={profile.name} color={profile.color} />
                <Card.Title class="truncate">{profile.name}</Card.Title>
              </div>
              <Badge
                variant="secondary"
                class="size-10 rounded-full p-0 text-sm font-semibold tabular-nums"
                aria-label={`${completed} / ${profileTasks.length} ${text.tasks.completed}`}
              >
                {completed}/{profileTasks.length}
              </Badge>
            </Card.Header>

            <ScrollArea.Root class="min-h-0 flex-1">
              <Card.Content class="gap-0 divide-y px-0">
                {#if loading}
                  {#each Array(3) as _}
                    <div class="flex min-h-16 items-center gap-3 px-4 py-3">
                      <Skeleton class="size-6 rounded" />
                      <div class="grid flex-1 gap-2">
                        <Skeleton class="h-4 w-2/3" />
                        <Skeleton class="h-3 w-1/3" />
                      </div>
                    </div>
                  {/each}
                {:else if profileTasks.length === 0}
                  <div class="grid min-h-40 place-content-center gap-2 px-6 text-center text-muted-foreground">
                    <ListChecks class="mx-auto size-7" aria-hidden="true" />
                    <p class="text-sm">{text.tasks.empty}</p>
                  </div>
                {:else}
                  {#each sortedTasks(profileTasks) as task (`${task.id}-${task.profileId}`)}
                    {@const pendingKey = `${task.id}\u0000${task.profileId}`}
                    <div
                      class="flex min-h-16 items-center gap-1 px-2 text-sm"
                      class:text-muted-foreground={task.completed}
                    >
                      <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-3">
                        <Checkbox
                          class="size-6"
                          checked={task.completed}
                          disabled={pendingCompletions.includes(pendingKey)}
                          aria-label={task.title}
                          onCheckedChange={(checked) =>
                            void toggleTask(task, checked === true)}
                        />
                        {#if task.emoji}
                          <span class="text-xl" aria-hidden="true">{task.emoji}</span>
                        {/if}
                        <span class="min-w-0 flex-1">
                          <span class="block font-medium" class:line-through={task.completed}>
                            {task.title}
                          </span>
                          <span class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            {#if task.kind === "routine"}
                              <Repeat2 class="size-3" aria-hidden="true" />
                              {text.tasks.routine}
                            {:else}
                              <ListChecks class="size-3" aria-hidden="true" />
                              {text.tasks.chore}
                              {#if task.dueTime}
                                · {task.dueTime.slice(0, 5)}
                              {/if}
                              {#if task.recurrence !== "none"}
                                · {text.tasks[task.recurrence]}
                              {/if}
                            {/if}
                          </span>
                        </span>
                      </label>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger>
                          {#snippet child({ props })}
                            <Button
                              {...props}
                              variant="ghost"
                              size="icon-sm"
                              class="shrink-0 text-muted-foreground"
                              aria-label={`${text.tasks.moreActions}: ${task.title}`}
                            >
                              <EllipsisVertical aria-hidden="true" />
                            </Button>
                          {/snippet}
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onSelect={() => openEditTask(task)}>
                            {text.tasks.edit}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            variant="destructive"
                            onSelect={() => openDeleteTask(task)}
                          >
                            {text.tasks.remove}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  {/each}
                {/if}
              </Card.Content>
            </ScrollArea.Root>
          </Card.Root>
        </div>
      {/each}
    </div>
  </ScrollArea.Root>
</div>

<Sheet.Root bind:open={createOpen}>
  <Sheet.Content class="w-screen max-w-none gap-2 overflow-x-hidden sm:w-3/4 sm:max-w-md">
    <Sheet.Header class="pb-2">
      <Sheet.Title>
        {editingTaskId ? text.tasks.editTitle : text.tasks.add}
      </Sheet.Title>
      <Sheet.Description>
        {editingTaskId ? text.tasks.editDescription : text.tasks.addDescription}
      </Sheet.Description>
    </Sheet.Header>

    <form class="flex min-h-0 flex-1 flex-col" onsubmit={submitTask}>
      <ScrollArea.Root class="min-h-0 flex-1">
        <div class="grid gap-3 px-4 py-1">
          <div class="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
            <div class="grid min-w-0 gap-1.5">
              <Label for="task-emoji">{text.tasks.emoji}</Label>
              <Input
                id="task-emoji"
                class="text-center text-xl"
                maxlength={8}
                bind:value={taskEmoji}
                placeholder="✓"
              />
            </div>
            <div class="grid min-w-0 gap-1.5">
              <Label for="task-title">{text.tasks.title}</Label>
              <Input
                id="task-title"
                maxlength={160}
                bind:value={taskTitle}
                placeholder={text.tasks.titlePlaceholder}
                required
              />
            </div>
          </div>

          <div class="grid gap-1.5">
            <Label>{text.tasks.type}</Label>
            <Tabs.Root bind:value={taskKind}>
              <Tabs.List class="grid w-full grid-cols-2">
                <Tabs.Trigger value="routine">
                  <Repeat2 />
                  {text.tasks.routine}
                </Tabs.Trigger>
                <Tabs.Trigger value="chore">
                  <ListChecks />
                  {text.tasks.chore}
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
          </div>

          <div class="grid gap-1.5">
            <Label>{text.tasks.assignTo}</Label>
            <div class="grid grid-cols-2 gap-1.5">
              {#each $appSettings.profiles as profile (profile.id)}
                <label class="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5">
                  <Checkbox
                    checked={selectedProfileIds.includes(profile.id)}
                    onCheckedChange={(checked) =>
                      toggleProfile(profile.id, checked === true)}
                    aria-label={profile.name}
                  />
                  <ProfileAvatar name={profile.name} color={profile.color} size="sm" />
                  <span class="truncate text-sm font-medium">{profile.name}</span>
                </label>
              {/each}
            </div>
            {#if selectedProfileIds.length === 0}
              <p class="text-sm text-destructive">{text.tasks.assignmentRequired}</p>
            {/if}
          </div>

          {#if taskKind === "routine"}
            <div class="grid gap-1.5">
              <Label>{text.tasks.block}</Label>
              <Tabs.Root bind:value={taskDayPart}>
                <Tabs.List class="grid w-full grid-cols-3">
                  {#each dayBlocks as block}
                    <Tabs.Trigger value={block.id}>{text.tasks[block.id]}</Tabs.Trigger>
                  {/each}
                </Tabs.List>
              </Tabs.Root>
            </div>

            <div class="grid gap-1.5">
              <Label>{text.tasks.repeats}</Label>
              <Tabs.Root bind:value={routineFrequency}>
                <Tabs.List class="grid w-full grid-cols-2">
                  <Tabs.Trigger value="daily">{text.tasks.everyDay}</Tabs.Trigger>
                  <Tabs.Trigger value="selected-days">
                    {text.tasks.selectedDays}
                  </Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>

              {#if routineFrequency === "selected-days"}
                <div
                  class="grid grid-cols-7 gap-1"
                  role="group"
                  aria-label={text.tasks.weekdays}
                >
                  {#each weekdays as weekday}
                    <Button
                      variant={taskWeekdays.includes(weekday.value)
                        ? "default"
                        : "outline"}
                      size="icon"
                      class="h-auto w-full aspect-square min-w-0 text-xs"
                      aria-label={text.tasks.days[weekday.id]}
                      aria-pressed={taskWeekdays.includes(weekday.value)}
                      onclick={() => toggleWeekday(weekday.value)}
                    >
                      {text.tasks.daysShort[weekday.id]}
                    </Button>
                  {/each}
                </div>
                {#if taskWeekdays.length === 0}
                  <p class="text-sm text-destructive">{text.tasks.weekdayRequired}</p>
                {/if}
              {/if}

              <p class="text-xs text-muted-foreground">
                {routineFrequency === "daily"
                  ? text.tasks.dailyRoutine
                  : text.tasks.weeklyRoutine}
              </p>
            </div>
          {:else}
            <div class="grid min-w-0 gap-2 sm:grid-cols-2">
              <div class="grid min-w-0 gap-1.5">
                <Label for="task-due-date">{text.tasks.date}</Label>
                <Input
                  id="task-due-date"
                  class="ios-temporal-input max-w-full"
                  type="date"
                  bind:value={taskDueDate}
                  required
                />
              </div>
              <div class="grid min-w-0 gap-1.5">
                <Label for="task-due-time">{text.tasks.timeOptional}</Label>
                <Input
                  id="task-due-time"
                  class="ios-temporal-input max-w-full"
                  type="time"
                  bind:value={taskDueTime}
                />
              </div>
            </div>

            <div class="grid gap-1.5">
              <Label>{text.tasks.repeats}</Label>
              <Tabs.Root bind:value={choreRecurrence}>
                <Tabs.List class="grid w-full grid-cols-4">
                  <Tabs.Trigger class="min-w-0 px-1 text-xs" value="none">
                    {text.tasks.recurrenceShort.none}
                  </Tabs.Trigger>
                  <Tabs.Trigger class="min-w-0 px-1 text-xs" value="daily">
                    {text.tasks.recurrenceShort.daily}
                  </Tabs.Trigger>
                  <Tabs.Trigger class="min-w-0 px-1 text-xs" value="weekly">
                    {text.tasks.recurrenceShort.weekly}
                  </Tabs.Trigger>
                  <Tabs.Trigger class="min-w-0 px-1 text-xs" value="monthly">
                    {text.tasks.recurrenceShort.monthly}
                  </Tabs.Trigger>
                </Tabs.List>
              </Tabs.Root>
              <p class="text-xs text-muted-foreground">
                {text.tasks.choreRecurrence[choreRecurrence]}
              </p>
            </div>
          {/if}

          {#if createError}
            <Alert.Root variant="destructive">
              <Alert.Title>
                {editingTaskId ? text.tasks.updateError : text.tasks.createError}
              </Alert.Title>
              <Alert.Description>{createError}</Alert.Description>
            </Alert.Root>
          {/if}
        </div>
      </ScrollArea.Root>

      <Sheet.Footer class="border-t py-3">
        <Button
          type="submit"
          size="lg"
          disabled={creating ||
            !taskTitle.trim() ||
            selectedProfileIds.length === 0 ||
            !routineScheduleIsValid}
        >
          {#if creating}
            {editingTaskId ? text.tasks.saving : text.tasks.creating}
          {:else}
            {editingTaskId ? text.tasks.save : text.tasks.create}
          {/if}
        </Button>
      </Sheet.Footer>
    </form>
  </Sheet.Content>
</Sheet.Root>

<AlertDialog.Root bind:open={deleteOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{text.tasks.removeTitle}</AlertDialog.Title>
      <AlertDialog.Description>
        {text.tasks.removeDescription.replace("{title}", taskToDelete?.title ?? "")}
      </AlertDialog.Description>
    </AlertDialog.Header>

    {#if deleteError}
      <Alert.Root variant="destructive">
        <Alert.Title>{text.tasks.removeError}</Alert.Title>
        <Alert.Description>{deleteError}</Alert.Description>
      </Alert.Root>
    {/if}

    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={deleting}>{text.tasks.cancel}</AlertDialog.Cancel>
      <AlertDialog.Action
        variant="destructive"
        disabled={deleting}
        onclick={confirmDeleteTask}
      >
        {deleting ? text.tasks.removing : text.tasks.remove}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  @supports (-webkit-touch-callout: none) {
    :global(.ios-temporal-input) {
      inline-size: 100%;
      min-inline-size: 0;
      max-inline-size: 100%;
      padding-inline: 0;
    }

    :global(.ios-temporal-input::-webkit-date-and-time-value) {
      min-inline-size: 0;
      padding-inline-start: 0.625rem;
      text-align: start;
    }
  }
</style>
