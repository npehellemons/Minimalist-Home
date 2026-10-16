<script lang="ts">
  import {
    Cloud,
    CloudFog,
    CloudLightning,
    CloudMoon,
    CloudRain,
    CloudSnow,
    CloudSun,
    Moon,
    Sun,
  } from "@lucide/svelte";
  import { onMount, type Snippet } from "svelte";
  import {
    activeProfileId,
    appSettings,
  } from "#lib/app-settings.js";
  import CalendarView from "#lib/components/calendar-view.svelte";
  import HomeView from "#lib/components/home-view.svelte";
  import SettingsView from "#lib/components/settings-view.svelte";
  import TasksView from "#lib/components/tasks-view.svelte";
  import { appLocale, translations } from "#lib/i18n.js";
  import { householdSession } from "#lib/household-session.js";
  import ProfileAvatar from "#lib/components/profile-avatar.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import { Separator } from "#lib/components/ui/separator/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { getWeatherStore } from "#lib/weather-store.js";

  let now = $state(new Date());
  const weatherStore = getWeatherStore();
  let weather = $derived($weatherStore.current);
  let weatherUnavailable = $derived($weatherStore.unavailable);
  let text = $derived(translations[$appSettings.language]);
  let householdName = $derived(
    $householdSession.household?.name ??
      ($appSettings.language === "nl" ? "Familie Hellemons" : "Hellemons Family"),
  );
  let formattedDate = $derived(
    new Intl.DateTimeFormat(appLocale($appSettings.language), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: $appSettings.location.timezone,
    }).format(now),
  );
  let formattedTime = $derived(
    new Intl.DateTimeFormat(appLocale($appSettings.language), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: $appSettings.location.timezone,
    }).format(now),
  );

  $effect(() => {
    if (
      !$appSettings.profiles.some((profile) => profile.id === $activeProfileId)
    ) {
      const familyProfile =
        $appSettings.profiles.find((profile) => profile.family) ??
        $appSettings.profiles[0];
      if (familyProfile) activeProfileId.set(familyProfile.id);
    }
  });

  onMount(() => {
    let clockTimeout: number;

    function scheduleClockUpdate() {
      const delayUntilNextMinute = 60_000 - (Date.now() % 60_000) + 50;

      clockTimeout = window.setTimeout(() => {
        now = new Date();
        scheduleClockUpdate();
      }, delayUntilNextMinute);
    }

    scheduleClockUpdate();

    return () => {
      window.clearTimeout(clockTimeout);
    };
  });
</script>

<svelte:head>
  <title>Home | Minimalist Home</title>
  <meta name="description" content="Minimalist Home dashboard." />
</svelte:head>

{#snippet dashboardPage(
  title: string,
  contentLabel: string,
  showWeather = true,
  content?: Snippet,
)}
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="flex shrink-0 flex-col gap-3 px-4 py-3 md:h-24 md:flex-row md:items-center md:justify-between md:px-10 md:py-0">
      <div class="min-w-0">
        <time
          class="mb-1 block truncate text-xs font-medium text-muted-foreground md:mb-2 md:text-sm"
          datetime={now.toISOString()}
        >
          {formattedDate} · {formattedTime}
        </time>
        <h1 class="truncate text-xl font-semibold md:text-3xl">{householdName}</h1>
      </div>

      <div class="flex min-w-0 items-center justify-between gap-3 md:justify-end md:gap-6">
        <ScrollArea.Root orientation="horizontal" class="min-w-0 max-w-full">
          <div
            class="flex w-max items-center gap-1 pr-2"
            role="group"
            aria-label={text.nav.profileFilter}
          >
            {#each $appSettings.profiles as profile (profile.id)}
              <Button
                variant="ghost"
                size="icon"
                class="rounded-full"
                aria-label={profile.name}
                aria-pressed={$activeProfileId === profile.id}
                onclick={() => activeProfileId.set(profile.id)}
              >
                <ProfileAvatar
                  name={profile.name}
                  color={profile.color}
                  active={$activeProfileId === profile.id}
                />
              </Button>
            {/each}
          </div>
        </ScrollArea.Root>

        {#if showWeather}
          <div
            class="flex shrink-0 items-center gap-2 text-muted-foreground md:gap-3"
            aria-label={weather
              ? `${weather.description}, ${Math.round(weather.temperature)} ${weather.unit}, ${$appSettings.location.name}`
              : weatherUnavailable
                ? text.weather.unavailable
                : text.weather.loading}
            aria-live="polite"
          >
            {#if weather?.kind === "clear"}
              {#if weather.isDay}
                <Sun class="size-7 md:size-8" aria-hidden="true" />
              {:else}
                <Moon class="size-7 md:size-8" aria-hidden="true" />
              {/if}
            {:else if weather?.kind === "partly-cloudy"}
              {#if weather.isDay}
                <CloudSun class="size-7 md:size-8" aria-hidden="true" />
              {:else}
                <CloudMoon class="size-7 md:size-8" aria-hidden="true" />
              {/if}
            {:else if weather?.kind === "cloudy"}
              <Cloud class="size-7 md:size-8" aria-hidden="true" />
            {:else if weather?.kind === "fog"}
              <CloudFog class="size-7 md:size-8" aria-hidden="true" />
            {:else if weather?.kind === "rain"}
              <CloudRain class="size-7 md:size-8" aria-hidden="true" />
            {:else if weather?.kind === "snow"}
              <CloudSnow class="size-7 md:size-8" aria-hidden="true" />
            {:else if weather?.kind === "storm"}
              <CloudLightning class="size-7 md:size-8" aria-hidden="true" />
            {:else}
              <CloudSun
                class={weatherUnavailable ? "size-7 md:size-8" : "size-7 animate-pulse md:size-8"}
                aria-hidden="true"
              />
            {/if}
            <div class="grid gap-0.5">
              <strong class="text-lg leading-none text-foreground">
                {weather
                  ? `${Math.round(weather.temperature)}${weather.unit}`
                  : "--°C"}
              </strong>
              <span class="hidden text-xs sm:inline">
                {weather?.description ??
                  (weatherUnavailable
                    ? text.weather.unavailable
                    : text.weather.loading)}
                · {$appSettings.location.name}
              </span>
            </div>
          </div>
        {/if}
      </div>
    </header>

    <Separator />

    {#if content}
      <section class="min-h-0 flex-1" aria-label={contentLabel}>
        {@render content()}
      </section>
    {:else}
      <ScrollArea.Root class="min-h-0 flex-1 bg-muted/30">
        <section class="min-h-full" aria-label={contentLabel}></section>
      </ScrollArea.Root>
    {/if}
  </div>
{/snippet}

{#snippet calendarContent()}
  <CalendarView />
{/snippet}

{#snippet homeContent()}
  <HomeView {now} />
{/snippet}

{#snippet tasksContent()}
  <TasksView />
{/snippet}

{#snippet settingsContent()}
  <SettingsView />
{/snippet}

<Tabs.Content class="h-full p-0" value="home">
  {@render dashboardPage("Home", "Home content", true, homeContent)}
</Tabs.Content>
<Tabs.Content class="h-full p-0" value="calendar">
  {@render dashboardPage("Calendar", "Calendar content", true, calendarContent)}
</Tabs.Content>
<Tabs.Content class="h-full p-0" value="tasks">
  {@render dashboardPage("Tasks", "Tasks content", true, tasksContent)}
</Tabs.Content>
<Tabs.Content class="h-full p-0" value="notes">
  {@render dashboardPage("Notes", "Notes content")}
</Tabs.Content>
<Tabs.Content class="h-full p-0" value="settings">
  {@render dashboardPage("Settings", "Settings content", true, settingsContent)}
</Tabs.Content>
