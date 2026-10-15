<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { activeProfileId, appSettings } from "#lib/app-settings.js";
  import { translations } from "#lib/i18n.js";
  import * as Avatar from "#lib/components/ui/avatar/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";

  type DayBlockId = "morning" | "afternoon" | "evening";

  type Chore = {
    id: string;
    title: string;
    completed: boolean;
  };

  type ChoreColumn = {
    id: string;
    name: string;
    initials: string;
    chores: Chore[];
  };

  const dayBlocks: Array<{ id: DayBlockId; range: string }> = [
    { id: "morning", range: "06:00 - 12:00" },
    { id: "afternoon", range: "12:00 - 18:00" },
    { id: "evening", range: "18:00 - 06:00" },
  ];

  function currentDayBlock(date: Date, timeZone: string): DayBlockId {
    const hour = Number(
      new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone,
      }).format(date),
    );

    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    return "evening";
  }

  function sortedChores(chores: Chore[]) {
    return [...chores].sort(
      (first, second) => Number(first.completed) - Number(second.completed),
    );
  }

  function completedCount(chores: Chore[]) {
    return chores.filter((chore) => chore.completed).length;
  }

  const initialNow = new Date();
  const initialSettings = get(appSettings);
  let now = $state(initialNow);
  let selectedBlockId = $state<DayBlockId>(
    currentDayBlock(initialNow, initialSettings.location.timezone),
  );
  let text = $derived(translations[$appSettings.language]);
  let activeBlockId = $derived(
    currentDayBlock(now, $appSettings.location.timezone),
  );
  let selectedBlock = $derived(
    dayBlocks.find((block) => block.id === selectedBlockId) ?? dayBlocks[0],
  );
  let visibleProfiles = $derived(
    $activeProfileId === "family"
      ? $appSettings.profiles
      : $appSettings.profiles.filter(
          (profile) => profile.id === $activeProfileId,
        ),
  );
  let profileCardBasis = $derived(
    visibleProfiles.length <= 1
      ? "100%"
      : visibleProfiles.length === 2
        ? "calc((100% - 1rem) / 2)"
        : "calc((100% - 2rem) / 3)",
  );

  let choresByBlock = $state<Record<DayBlockId, ChoreColumn[]>>({
    morning: [
      {
        id: "family",
        name: "Samen",
        initials: "S",
        chores: [
          {
            id: "morning-together-1",
            title: "Tafel afruimen",
            completed: false,
          },
          {
            id: "morning-together-2",
            title: "Lichten uitdoen",
            completed: false,
          },
        ],
      },
      {
        id: "nicky",
        name: "Nicky",
        initials: "N",
        chores: [
          {
            id: "morning-nicky-1",
            title: "Vaatwasser uitruimen",
            completed: false,
          },
          {
            id: "morning-nicky-2",
            title: "Ontbijt klaarmaken",
            completed: false,
          },
          { id: "morning-nicky-3", title: "Was aanzetten", completed: false },
        ],
      },
      {
        id: "noor",
        name: "Noor",
        initials: "N",
        chores: [
          { id: "morning-noor-1", title: "Bed opmaken", completed: false },
          { id: "morning-noor-2", title: "Tanden poetsen", completed: false },
          { id: "morning-noor-3", title: "Tas controleren", completed: false },
        ],
      },
    ],
    afternoon: [
      {
        id: "family",
        name: "Samen",
        initials: "S",
        chores: [
          {
            id: "afternoon-together-1",
            title: "Post meenemen",
            completed: false,
          },
          {
            id: "afternoon-together-2",
            title: "Hond uitlaten",
            completed: false,
          },
        ],
      },
      {
        id: "nicky",
        name: "Nicky",
        initials: "N",
        chores: [
          {
            id: "afternoon-nicky-1",
            title: "Boodschappen doen",
            completed: false,
          },
          { id: "afternoon-nicky-2", title: "Was ophangen", completed: false },
        ],
      },
      {
        id: "noor",
        name: "Noor",
        initials: "N",
        chores: [
          { id: "afternoon-noor-1", title: "Tas opruimen", completed: false },
          { id: "afternoon-noor-2", title: "Huiswerk maken", completed: false },
          { id: "afternoon-noor-3", title: "Kamer opruimen", completed: false },
        ],
      },
    ],
    evening: [
      {
        id: "family",
        name: "Samen",
        initials: "S",
        chores: [
          {
            id: "evening-together-1",
            title: "Tafel afruimen",
            completed: false,
          },
          {
            id: "evening-together-2",
            title: "Woonkamer opruimen",
            completed: false,
          },
        ],
      },
      {
        id: "nicky",
        name: "Nicky",
        initials: "N",
        chores: [
          { id: "evening-nicky-1", title: "Avondeten koken", completed: false },
          {
            id: "evening-nicky-2",
            title: "Vaatwasser aanzetten",
            completed: false,
          },
          {
            id: "evening-nicky-3",
            title: "Afval buitenzetten",
            completed: false,
          },
        ],
      },
      {
        id: "noor",
        name: "Noor",
        initials: "N",
        chores: [
          {
            id: "evening-noor-1",
            title: "Speelgoed opruimen",
            completed: false,
          },
          {
            id: "evening-noor-2",
            title: "Pyjama aantrekken",
            completed: false,
          },
          { id: "evening-noor-3", title: "Tanden poetsen", completed: false },
        ],
      },
    ],
  });

  onMount(() => {
    const clockInterval = window.setInterval(() => {
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
    }, 60_000);

    return () => window.clearInterval(clockInterval);
  });
</script>

<div class="flex h-full min-h-0 flex-col bg-background">
  <div class="flex h-20 shrink-0 items-center justify-between border-b px-6">
    <div class="grid gap-1">
      <p class="text-sm font-medium text-muted-foreground">
        {#if selectedBlock.id === activeBlockId}{text.tasks.now} ·
        {/if}{selectedBlock.range}
      </p>
      <h2 class="text-2xl font-semibold">{text.tasks[selectedBlock.id]}</h2>
    </div>

    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1.5">
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

      <div
        class="flex h-10 items-center rounded-lg bg-muted/30 p-1"
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
    </div>
  </div>

  <ScrollArea.Root orientation="horizontal" class="min-h-0 flex-1 bg-muted/30">
    <div class="flex h-full min-w-full gap-4 p-4">
      {#each visibleProfiles as profile (profile.id)}
        {@const column = choresByBlock[selectedBlockId].find(
          (item) => item.id === profile.id,
        )}
        {@const chores = column?.chores ?? []}
        {@const completed = completedCount(chores)}
        <Card.Root
          class="h-full min-h-0 min-w-0 shrink-0 gap-0 rounded-lg py-0"
          style={`flex-basis: ${profileCardBasis}`}
          size="sm"
          role="region"
          aria-label={`${text.tasks.for} ${profile.name}`}
        >
          <Card.Header
            class="flex min-h-16 shrink-0 flex-row items-center justify-between border-b px-4 pt-(--card-spacing)"
          >
            <div class="flex min-w-0 items-center gap-3">
              <Avatar.Root>
                <Avatar.Fallback
                  style={`background-color: ${profile.color}; color: white`}
                >
                  {profile.avatar}
                </Avatar.Fallback>
              </Avatar.Root>
              <Card.Title class="truncate">{profile.name}</Card.Title>
            </div>
            <Badge
              variant="secondary"
              class="size-10 rounded-full p-0 text-sm font-semibold tabular-nums"
              aria-label={`${completed} / ${chores.length} ${text.tasks.completed}`}
            >
              {completed}/{chores.length}
            </Badge>
          </Card.Header>

          <ScrollArea.Root class="min-h-0 flex-1">
            <Card.Content class="gap-0 divide-y px-0">
              {#each sortedChores(chores) as chore (chore.id)}
                <label
                  class="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-sm"
                  class:text-muted-foreground={chore.completed}
                >
                  <Checkbox
                    id={chore.id}
                    class="size-6"
                    bind:checked={chore.completed}
                    aria-label={chore.title}
                  />
                  <span class:line-through={chore.completed}>{chore.title}</span
                  >
                </label>
              {/each}
            </Card.Content>
          </ScrollArea.Root>
        </Card.Root>
      {/each}
    </div>
  </ScrollArea.Root>
</div>
