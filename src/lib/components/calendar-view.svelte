<script lang="ts">
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { derived, get } from "svelte/store";
  import {
    activeProfileId,
    appSettings,
    type AppSettings,
    type HouseholdProfile,
  } from "#lib/app-settings.js";
  import { getHouseholdCalendarEvents } from "#lib/calendar-events.js";
  import { CALENDAR_REFRESH_INTERVAL } from "#lib/calendar-feed.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import {
    Calendar,
    type EventApi,
    type EventInput,
    type EventSourceFuncInfo,
  } from "fullcalendar";
  import dayGridPlugin from "fullcalendar/daygrid";
  import enGbLocale from "fullcalendar/locales/en-gb";
  import nlLocale from "fullcalendar/locales/nl";
  import timeGridPlugin from "fullcalendar/timegrid";
  import formaThemePlugin from "fullcalendar/themes/forma";
  import "fullcalendar/skeleton.css";
  import "fullcalendar/themes/forma/theme.css";
  import "fullcalendar/themes/forma/palettes/red.css";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";

  let { active = true }: { active?: boolean } = $props();

  let calendarElement: HTMLDivElement;
  let calendar: Calendar | undefined;
  let calendarReady = $state(false);
  let calendarTitle = $state("");
  let currentView = $state("dayGridMonth");
  let eventPopoverOpen = $state(false);
  let selectedEventAnchor = $state<HTMLElement | null>(null);
  let selectedEventTitle = $state("");
  let selectedEventTime = $state("");
  let selectedEventLocation = $state("");
  let text = $derived(translations[$appSettings.language]);
  function profilesForSelection(
    profiles: HouseholdProfile[],
    selectedProfileId: string,
  ) {
    const selectedProfile = profiles.find(
      (profile) => profile.id === selectedProfileId,
    );

    return selectedProfile?.family
      ? profiles
      : profiles.filter((profile) => profile.id === selectedProfileId);
  }

  let visibleProfiles = $derived(
    profilesForSelection($appSettings.profiles, $activeProfileId),
  );
  let calendarLoadGeneration = 0;
  let calendarSettingsKey = "";
  let latestProfiles: HouseholdProfile[] = [];

  function readableTextColor(background: string) {
    const hex = background.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";

    const [red, green, blue] = [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    );
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    return luminance > 160 ? "#111827" : "#ffffff";
  }

  function formatEventTime(event: EventApi) {
    if (!event.start) return "";

    const settings = get(appSettings);
    const locale = appLocale(settings.language);
    const date = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: settings.location.timezone,
    }).format(event.start);

    if (event.allDay)
      return `${date} · ${translations[settings.language].calendar.allDay}`;

    const eventTimeFormatter = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: settings.location.timezone,
    });
    const start = eventTimeFormatter.format(event.start);

    if (!event.end) return `${date} · ${start}`;

    const end = eventTimeFormatter.format(event.end);
    return `${date} · ${start}–${end}`;
  }

  async function loadCalendarRange(info: EventSourceFuncInfo) {
    const generation = calendarLoadGeneration;
    const settings = get(appSettings);

    try {
      const events = await getHouseholdCalendarEvents(
        latestProfiles,
        info.start,
        info.end,
        settings.location.timezone,
      );
      if (generation !== calendarLoadGeneration) return [];

      return events.map(
        (event): EventInput => ({
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          color: event.profileColor,
          contrastColor: readableTextColor(event.profileColor),
          display:
            event.allDay &&
            event.end.getTime() - event.start.getTime() > 26 * 60 * 60 * 1000
              ? "block"
              : "list-item",
          extendedProps: {
            location: event.location,
            profileId: event.profileId,
            profileName: event.profileName,
            calendarName: event.calendarName,
          },
        }),
      );
    } catch (error) {
      console.error("Unable to load calendar events", error);
      return [];
    }
  }

  function applyCalendarSettings(
    settings: AppSettings,
    profiles: HouseholdProfile[],
  ) {
    calendar?.batchRendering(() => {
      calendar?.setOption(
        "locale",
        settings.language === "nl" ? nlLocale : enGbLocale,
      );
      calendar?.setOption(
        "allDayText",
        translations[settings.language].calendar.allDay,
      );
      calendar?.setOption("timeZone", settings.location.timezone);
    });

    const nextKey = JSON.stringify({
      timeZone: settings.location.timezone,
      profiles: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        color: profile.color,
        calendars: profile.calendars,
      })),
    });
    if (nextKey !== calendarSettingsKey) {
      calendarSettingsKey = nextKey;
      calendarLoadGeneration += 1;
      calendar?.refetchEvents();
    }
  }

  function changeView(view: string) {
    calendar?.changeView(view);
  }

  onMount(() => {
    calendar = new Calendar(calendarElement, {
      plugins: [
        formaThemePlugin,
        dayGridPlugin,
        timeGridPlugin,
      ],
      events: loadCalendarRange,
      initialView: currentView,
      views: {
        timeGridThreeDay: {
          type: "timeGrid",
          duration: { days: 3 },
        },
      },
      locale: $appSettings.language === "nl" ? nlLocale : enGbLocale,
      timeZone: $appSettings.location.timezone,
      colorScheme: document.documentElement.classList.contains("dark")
        ? "dark"
        : "light",
      headerToolbar: false,
      height: "100%",
      expandRows: true,
      firstDay: 1,
      nowIndicator: true,
      allDayText: text.calendar.allDay,
      dayMaxEvents: true,
      eventInteractive: true,
      eventDisplay: "list-item",
      slotMinTime: "06:00:00",
      slotMaxTime: "24:00:00",
      slotDuration: "01:00:00",
      scrollTime: "08:00:00",
      eventTimeFormat: {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
      datesSet(info) {
        eventPopoverOpen = false;
        calendarTitle = info.view.title;
        currentView = info.view.type;
      },
      eventClick(info) {
        info.jsEvent.preventDefault();
        selectedEventAnchor = info.el;
        selectedEventTitle = info.event.title;
        selectedEventTime = formatEventTime(info.event);
        selectedEventLocation = String(info.event.extendedProps.location ?? "");
        eventPopoverOpen = true;
      },
    });

    calendar.render();
    calendarReady = true;

    const calendarSettings = derived(
      [appSettings, activeProfileId],
      ([settings, selectedProfileId]) => ({
        settings,
        profiles: profilesForSelection(settings.profiles, selectedProfileId),
      }),
    );
    const unsubscribeSettings = calendarSettings.subscribe(
      ({ settings, profiles }) => {
        latestProfiles = profiles;
        if (active) applyCalendarSettings(settings, profiles);
      },
    );

    return () => {
      unsubscribeSettings();
      calendarLoadGeneration += 1;
      calendarReady = false;
      calendar?.destroy();
      calendar = undefined;
    };
  });

  $effect(() => {
    if (!active || !calendarReady || typeof window === "undefined") return;

    const settings = get(appSettings);
    const profiles = profilesForSelection(
      settings.profiles,
      get(activeProfileId),
    );
    latestProfiles = profiles;
    applyCalendarSettings(settings, profiles);

    const darkModeObserver = new MutationObserver(() => {
      calendar?.setOption(
        "colorScheme",
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    });
    darkModeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const calendarRefreshInterval = window.setInterval(
      () => calendar?.refetchEvents(),
      CALENDAR_REFRESH_INTERVAL + 5_000,
    );

    return () => {
      calendarLoadGeneration += 1;
      calendarSettingsKey = "";
      darkModeObserver.disconnect();
      window.clearInterval(calendarRefreshInterval);
    };
  });
</script>

<div class="flex h-full min-h-0 flex-col bg-background">
  <div
    class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-2 md:h-14 md:flex-nowrap md:px-4 md:py-0"
  >
    <div class="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={text.calendar.previous}
        onclick={() => calendar?.prev()}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button variant="outline" onclick={() => calendar?.today()}
        >{text.calendar.today}</Button
      >
      <Button
        variant="ghost"
        size="icon"
        aria-label={text.calendar.next}
        onclick={() => calendar?.next()}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>

    <h2
      class="order-first w-full truncate text-center text-base font-semibold capitalize md:order-none md:w-auto md:text-lg"
    >
      {calendarTitle}
    </h2>

    <div class="flex min-w-0 items-center gap-2">
      <div class="hidden items-center gap-1.5 lg:flex">
        {#each visibleProfiles.filter( (profile) => profile.calendars.some((feed) => feed.enabled), ) as profile (profile.id)}
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
        class="grid h-9 grid-cols-4 items-center gap-0.5 rounded-lg bg-muted p-[3px]"
        role="group"
        aria-label={text.calendar.view}
      >
        {#each [{ id: "timeGridDay", label: text.calendar.day }, { id: "timeGridThreeDay", label: text.calendar.threeDays }, { id: "timeGridWeek", label: text.calendar.week }, { id: "dayGridMonth", label: text.calendar.month }] as view (view.id)}
          <Button
            variant={currentView === view.id ? "default" : "ghost"}
            size="sm"
            class={currentView === view.id
              ? "h-7 px-2 shadow-sm ring-1 ring-primary/25"
              : "h-7 px-2 text-muted-foreground"}
            aria-pressed={currentView === view.id}
            onclick={() => changeView(view.id)}
          >
            {view.label}
          </Button>
        {/each}
      </div>
    </div>
  </div>

  <div class="calendar-shell min-h-0 flex-1 bg-muted/30 p-1.5 sm:p-4">
    <div class="h-full min-h-0" bind:this={calendarElement}></div>
  </div>

  <Popover.Root bind:open={eventPopoverOpen}>
    <Popover.Content
      customAnchor={selectedEventAnchor}
      side="top"
      align="center"
      sideOffset={6}
      class="w-72 gap-2"
    >
      <Popover.Header>
        <Popover.Title class="text-base leading-snug">
          {selectedEventTitle}
        </Popover.Title>
        {#if selectedEventTime}
          <Popover.Description>{selectedEventTime}</Popover.Description>
        {/if}
      </Popover.Header>
      {#if selectedEventLocation}
        <p class="text-sm">{selectedEventLocation}</p>
      {/if}
    </Popover.Content>
  </Popover.Root>
</div>

<style>
  :global([data-color-scheme="dark"]) {
    --fc-forma-background: var(--popover) !important;
  }

  @media (max-width: 767px) {
    .calendar-shell :global(.fc) {
      font-size: 0.75rem;
    }
  }
</style>
