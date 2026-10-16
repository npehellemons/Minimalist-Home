<script lang="ts">
  import {
    CalendarDays,
    House,
    ListChecks,
    LoaderCircle,
    MonitorPlay,
    NotebookTabs,
    Settings,
  } from "@lucide/svelte";
  import { appSettings } from "#lib/app-settings.js";
  import OnboardingView from "#lib/components/onboarding-view.svelte";
  import Screensaver from "#lib/components/screensaver.svelte";
  import {
    householdSession,
    startHouseholdSession,
  } from "#lib/household-session.js";
  import { translations } from "#lib/i18n.js";
  import { provideWeatherStore } from "#lib/weather-store.js";
  import * as Avatar from "#lib/components/ui/avatar/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { setMode } from "mode-watcher";
  import { onMount, untrack } from "svelte";
  import { fade } from "svelte/transition";

  let { children } = $props();
  let activeTab = $state("home");
  let screensaverActive = $state(false);
  let text = $derived(translations[$appSettings.language]);
  provideWeatherStore();

  onMount(() => startHouseholdSession());

  $effect(() => {
    const preferredMode = $appSettings.colorMode;
    untrack(() => setMode(preferredMode === "auto" ? "system" : preferredMode));
  });

  function enterScreensaver() {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen may be unavailable outside a direct user interaction.
      });
    }

    screensaverActive = true;
  }

  function exitScreensaver() {
    screensaverActive = false;
  }
</script>

<div class="relative h-full w-full overflow-hidden">
  {#if $householdSession.status === "loading"}
    <main class="grid h-full w-full place-items-center bg-muted/30 p-4">
      <Card.Root class="w-full max-w-sm" size="sm">
        <Card.Content class="flex min-h-48 flex-col items-center justify-center gap-4 text-center">
          <Avatar.Root size="lg">
            <Avatar.Fallback>
              <House aria-hidden="true" />
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="grid justify-items-center gap-2">
            <LoaderCircle class="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p class="font-medium">{text.onboarding.loading}</p>
          </div>
        </Card.Content>
      </Card.Root>
    </main>
  {:else if $householdSession.status !== "ready" && $householdSession.status !== "unconfigured"}
    <OnboardingView />
  {:else if screensaverActive}
    <div class="absolute inset-0" transition:fade={{ duration: 250 }}>
      <Screensaver onExit={exitScreensaver} />
    </div>
  {:else}
    <div class="absolute inset-0" transition:fade={{ duration: 250 }}>
      <Sidebar.Provider
        class="h-full min-h-0"
        style="--sidebar-width: 5rem; --sidebar-width-mobile: 7rem;"
      >
        <Tabs.Root
          bind:value={activeTab}
          orientation="vertical"
          activationMode="automatic"
          class="h-full w-full flex-row gap-0"
        >
          <Sidebar.Root collapsible="none" class="border-r">
            <Sidebar.Header class="h-24 items-center justify-center">
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      size="icon-lg"
                      onclick={enterScreensaver}
                      aria-label={text.nav.screensaver}
                    >
                      <MonitorPlay aria-hidden="true" />
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right"
                  >{text.nav.screensaver}</Tooltip.Content
                >
              </Tooltip.Root>
            </Sidebar.Header>

            <Sidebar.Content class="p-1">
              <Tabs.List
                variant="line"
                class="h-full w-full flex-col justify-start gap-1 rounded-none bg-transparent p-0"
                aria-label="Dashboard sections"
              >
                <Tabs.Trigger
                  class="h-16 flex-none flex-col items-center justify-center gap-1 group-data-vertical/tabs:justify-center"
                  value="home"
                >
                  <House class="size-5" aria-hidden="true" />
                </Tabs.Trigger>
                <Tabs.Trigger
                  class="h-16 flex-none flex-col items-center justify-center gap-1 group-data-vertical/tabs:justify-center"
                  value="calendar"
                >
                  <CalendarDays class="size-5" aria-hidden="true" />
                </Tabs.Trigger>
                <Tabs.Trigger
                  class="h-16 flex-none flex-col items-center justify-center gap-1 group-data-vertical/tabs:justify-center"
                  value="tasks"
                >
                  <ListChecks class="size-5" aria-hidden="true" />
                </Tabs.Trigger>
                <Tabs.Trigger
                  class="h-16 flex-none flex-col items-center justify-center gap-1 group-data-vertical/tabs:justify-center"
                  value="notes"
                >
                  <NotebookTabs class="size-5" aria-hidden="true" />
                </Tabs.Trigger>
                <Tabs.Trigger
                  class="mt-auto h-16 flex-none flex-col items-center justify-center gap-1 group-data-vertical/tabs:justify-center"
                  value="settings"
                >
                  <Settings class="size-5" aria-hidden="true" />
                </Tabs.Trigger>
              </Tabs.List>
            </Sidebar.Content>
          </Sidebar.Root>

          <Sidebar.Inset class="min-h-0 min-w-0 overflow-hidden">
            {@render children()}
          </Sidebar.Inset>
        </Tabs.Root>
      </Sidebar.Provider>
    </div>
  {/if}
</div>
