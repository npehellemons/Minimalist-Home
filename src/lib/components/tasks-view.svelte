<script lang="ts">
  import { ListChecks, Plus, Repeat2 } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { get } from "svelte/store";

  import {
    activeProfileId,
    appSettings,
    type HouseholdProfile,
  } from "#lib/app-settings.js";
  import ProfileAvatar from "#lib/components/profile-avatar.svelte";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
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
    getDailyTasks,
    setTaskCompleted,
    subscribeToTasks,
    type DailyTask,
    type TaskDayPart,
    type TaskKind,
  } from "#lib/tasks.js";

  type DayBlock = {
    id: TaskDayPart;
    range: string;
  };

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
  let taskTitle = $state("");
  let taskEmoji = $state("");
  let taskKind = $state<TaskKind>("routine");
  let taskDayPart = $state<TaskDayPart>(initialBlock);
  let taskDueDate = $state(
    dateKeyInTimeZone(initialNow, initialSettings.location.timezone),
  );
  let taskDueTime = $state("");
  let selectedProfileIds = $state<string[]>([]);

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
    taskDueDate = todayKey;
    taskDueTime = "";
    selectedProfileIds = defaultProfile ? [defaultProfile.id] : [];
    createError = "";
    createOpen = true;
  }

  function toggleProfile(profileId: string, checked: boolean) {
    selectedProfileIds = checked
      ? [...new Set([...selectedProfileIds, profileId])]
      : selectedProfileIds.filter((id) => id !== profileId);
  }

  async function submitTask(event: SubmitEvent) {
    event.preventDefault();
    const session = get(householdSession);
    if (!session.household || !taskTitle.trim() || selectedProfileIds.length === 0) {
      return;
    }

    creating = true;
    createError = "";

    try {
      await createTask({
        householdId: session.household.id,
        title: taskTitle,
        emoji: taskEmoji,
        kind: taskKind,
        profileIds: selectedProfileIds,
        dayPart: taskDayPart,
        dueDate: taskDueDate,
        dueTime: taskDueTime,
      });
      createOpen = false;
      await loadTasks();
    } catch (error) {
      console.error("Unable to create household task", error);
      createError = text.tasks.createErrorDescription;
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
    <div class="flex h-full min-w-full gap-4 p-4">
      {#each visibleProfiles as profile (profile.id)}
        {@const profileTasks = tasksForProfile(profile)}
        {@const completed = completedCount(profileTasks)}
        <Card.Root
          class="h-full min-h-0 min-w-0 shrink-0 snap-start basis-[calc(100vw-2rem)] gap-0 rounded-lg py-0 md:snap-none md:basis-[var(--profile-card-basis)]"
          style={`--profile-card-basis: ${profileCardBasis}`}
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
                  <label
                    class="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 text-sm"
                    class:text-muted-foreground={task.completed}
                  >
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
                        {/if}
                      </span>
                    </span>
                  </label>
                {/each}
              {/if}
            </Card.Content>
          </ScrollArea.Root>
        </Card.Root>
      {/each}
    </div>
  </ScrollArea.Root>
</div>

<Sheet.Root bind:open={createOpen}>
  <Sheet.Content class="w-screen max-w-none sm:w-3/4 sm:max-w-md">
    <Sheet.Header>
      <Sheet.Title>{text.tasks.add}</Sheet.Title>
      <Sheet.Description>{text.tasks.addDescription}</Sheet.Description>
    </Sheet.Header>

    <form class="flex min-h-0 flex-1 flex-col" onsubmit={submitTask}>
      <ScrollArea.Root class="min-h-0 flex-1">
        <div class="grid gap-5 px-4 py-2">
          <div class="grid grid-cols-[5rem_1fr] gap-3">
            <div class="grid gap-2">
              <Label for="task-emoji">{text.tasks.emoji}</Label>
              <Input
                id="task-emoji"
                class="text-center text-xl"
                maxlength={8}
                bind:value={taskEmoji}
                placeholder="✓"
              />
            </div>
            <div class="grid gap-2">
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

          <div class="grid gap-2">
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

          <div class="grid gap-2">
            <Label>{text.tasks.assignTo}</Label>
            <div class="grid gap-2">
              {#each $appSettings.profiles as profile (profile.id)}
                <label class="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2">
                  <Checkbox
                    checked={selectedProfileIds.includes(profile.id)}
                    onCheckedChange={(checked) =>
                      toggleProfile(profile.id, checked === true)}
                    aria-label={profile.name}
                  />
                  <ProfileAvatar name={profile.name} color={profile.color} />
                  <span class="font-medium">{profile.name}</span>
                </label>
              {/each}
            </div>
            {#if selectedProfileIds.length === 0}
              <p class="text-sm text-destructive">{text.tasks.assignmentRequired}</p>
            {/if}
          </div>

          {#if taskKind === "routine"}
            <div class="grid gap-2">
              <Label>{text.tasks.block}</Label>
              <Tabs.Root bind:value={taskDayPart}>
                <Tabs.List class="grid w-full grid-cols-3">
                  {#each dayBlocks as block}
                    <Tabs.Trigger value={block.id}>{text.tasks[block.id]}</Tabs.Trigger>
                  {/each}
                </Tabs.List>
              </Tabs.Root>
              <p class="text-xs text-muted-foreground">{text.tasks.dailyRoutine}</p>
            </div>
          {:else}
            <div class="grid grid-cols-2 gap-3">
              <div class="grid gap-2">
                <Label for="task-due-date">{text.tasks.date}</Label>
                <Input id="task-due-date" type="date" bind:value={taskDueDate} required />
              </div>
              <div class="grid gap-2">
                <Label for="task-due-time">{text.tasks.timeOptional}</Label>
                <Input id="task-due-time" type="time" bind:value={taskDueTime} />
              </div>
            </div>
          {/if}

          {#if createError}
            <Alert.Root variant="destructive">
              <Alert.Title>{text.tasks.createError}</Alert.Title>
              <Alert.Description>{createError}</Alert.Description>
            </Alert.Root>
          {/if}
        </div>
      </ScrollArea.Root>

      <Sheet.Footer class="border-t">
        <Button
          type="submit"
          size="lg"
          disabled={creating || !taskTitle.trim() || selectedProfileIds.length === 0}
        >
          {creating ? text.tasks.creating : text.tasks.create}
        </Button>
      </Sheet.Footer>
    </form>
  </Sheet.Content>
</Sheet.Root>
