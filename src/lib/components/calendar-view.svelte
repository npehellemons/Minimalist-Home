<script lang="ts">
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { derived, get } from "svelte/store";
  import {
    activeProfileId,
    appSettings,
    type HouseholdProfile,
  } from "#lib/app-settings.js";
  import {
    CALENDAR_REFRESH_INTERVAL,
    fetchCalendarFeed,
  } from "#lib/calendar-feed.js";
  import { appLocale, translations } from "#lib/i18n.js";
  import {
    Calendar,
    type EventApi,
    type EventSourceInput,
    type PluginInput,
  } from "fullcalendar";
  import dayGridPlugin from "fullcalendar/daygrid";
  import enGbLocale from "fullcalendar/locales/en-gb";
  import nlLocale from "fullcalendar/locales/nl";
  import timeGridPlugin from "fullcalendar/timegrid";
  import formaThemePlugin from "fullcalendar/themes/forma";
  import iCalendarPlugin from "@fullcalendar/icalendar";
  import "fullcalendar/skeleton.css";
  import "fullcalendar/themes/forma/theme.css";
  import "fullcalendar/themes/forma/palettes/red.css";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";

  let calendarElement: HTMLDivElement;
  let calendar: Calendar | undefined;
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
  const calendarSources = new Map<
    string,
    { blobUrl: string; calendarData: string; color: string }
  >();
  let calendarLoadGeneration = 0;

  type OwnedCalendarFeed = HouseholdProfile["calendars"][number] & {
    ownerId: string;
    ownerColor: string;
  };

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

  function clearCalendarFeeds() {
    for (const [id, source] of calendarSources) {
      calendar?.getEventSourceById(`ical-${id}`)?.remove();
      URL.revokeObjectURL(source.blobUrl);
    }
    calendarSources.clear();
  }

  async function syncCalendarFeeds(profiles: HouseholdProfile[]) {
    const generation = ++calendarLoadGeneration;
    const feeds: OwnedCalendarFeed[] = profiles.flatMap((profile) =>
      profile.calendars.map((feed) => ({
        ...feed,
        ownerId: profile.id,
        ownerColor: profile.color,
      })),
    );
    const enabledFeeds = feeds.filter(
      (feed) => feed.enabled && feed.url.trim(),
    );
    const activeSourceIds = new Set(
      enabledFeeds.map((feed) => `${feed.ownerId}-${feed.id}`),
    );

    for (const [sourceId, source] of calendarSources) {
      if (activeSourceIds.has(sourceId)) continue;

      calendar?.getEventSourceById(`ical-${sourceId}`)?.remove();
      URL.revokeObjectURL(source.blobUrl);
      calendarSources.delete(sourceId);
    }

    await Promise.all(
      enabledFeeds.map(async (feed) => {
        try {
          const { calendarData } = await fetchCalendarFeed(feed.url);

          if (generation !== calendarLoadGeneration) return;

          const sourceId = `${feed.ownerId}-${feed.id}`;
          const existingSource = calendarSources.get(sourceId);

          if (
            existingSource?.calendarData === calendarData &&
            existingSource.color === feed.ownerColor
          ) {
            return;
          }

          if (existingSource) {
            calendar?.getEventSourceById(`ical-${sourceId}`)?.remove();
            URL.revokeObjectURL(existingSource.blobUrl);
          }

          const blobUrl = URL.createObjectURL(
            new Blob([calendarData], { type: "text/calendar" }),
          );
          calendarSources.set(sourceId, {
            blobUrl,
            calendarData,
            color: feed.ownerColor,
          });
          calendar?.addEventSource({
            id: `ical-${sourceId}`,
            url: blobUrl,
            format: "ics",
            color: feed.ownerColor,
            contrastColor: readableTextColor(feed.ownerColor),
          } as EventSourceInput);
        } catch {
          // A failing feed should not prevent other configured calendars loading.
        }
      }),
    );
  }

  function changeView(view: string) {
    calendar?.changeView(view);
  }

  onMount(() => {
    const darkModeObserver = new MutationObserver(() => {
      calendar?.setOption(
        "colorScheme",
        document.documentElement.classList.contains("dark") ? "dark" : "light",
      );
    });

    calendar = new Calendar(calendarElement, {
      plugins: [
        formaThemePlugin,
        dayGridPlugin,
        timeGridPlugin,
        iCalendarPlugin as unknown as PluginInput,
      ],
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

    darkModeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let calendarSettingsKey = "";
    let latestProfiles: HouseholdProfile[] = [];
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
        calendar?.setOption(
          "locale",
          settings.language === "nl" ? nlLocale : enGbLocale,
        );
        calendar?.setOption(
          "allDayText",
          translations[settings.language].calendar.allDay,
        );
        calendar?.setOption("timeZone", settings.location.timezone);

        const nextKey = JSON.stringify(
          profiles.map((profile) => ({
            id: profile.id,
            color: profile.color,
            calendars: profile.calendars,
          })),
        );
        if (nextKey !== calendarSettingsKey) {
          calendarSettingsKey = nextKey;
          void syncCalendarFeeds(profiles);
        }
      },
    );
    const calendarRefreshInterval = window.setInterval(
      () => void syncCalendarFeeds(latestProfiles),
      CALENDAR_REFRESH_INTERVAL + 5_000,
    );

    return () => {
      unsubscribeSettings();
      window.clearInterval(calendarRefreshInterval);
      calendarLoadGeneration += 1;
      darkModeObserver.disconnect();
      clearCalendarFeeds();
      calendar?.destroy();
      calendar = undefined;
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
