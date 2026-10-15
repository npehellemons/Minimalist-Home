<script lang="ts">
  import {
    CalendarDays,
    House,
    ListChecks,
    MonitorPlay,
    NotebookTabs,
    Settings,
  } from "@lucide/svelte";
  import { appSettings } from "#lib/app-settings.js";
  import Screensaver from "#lib/components/screensaver.svelte";
  import { translations } from "#lib/i18n.js";
  import { provideWeatherStore } from "#lib/weather-store.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { setMode } from "mode-watcher";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";

  let { children } = $props();
  let activeTab = $state("home");
  let screensaverActive = $state(false);
  let text = $derived(translations[$appSettings.language]);
  provideWeatherStore();

  $effect(() => {
    const preferredMode = $appSettings.colorMode;
    untrack(() => setMode(preferredMode === "auto" ? "system" : preferredMode));
  });

  function enterScreensaver() {
    screensaverActive = true;
  }

  function exitScreensaver() {
    screensaverActive = false;
  }
</script>

<div class="relative h-full w-full overflow-hidden">
  {#if screensaverActive}
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
