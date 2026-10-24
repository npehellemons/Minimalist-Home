<script lang="ts">
  import { Gauge, Trash2 } from "@lucide/svelte";
  import { appSettings } from "#lib/app-settings.js";
  import type { DashboardView } from "#lib/dashboard-navigation.svelte.js";
  import { translations } from "#lib/i18n.js";
  import {
    clearTabPerformanceSamples,
    tabPerformanceSamples,
  } from "#lib/performance-metrics.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";

  const views: DashboardView[] = ["home", "calendar", "tasks", "settings"];
  let text = $derived(translations[$appSettings.language]);
  let latestByView = $derived(
    views.flatMap((view) => {
      const sample = $tabPerformanceSamples.find((entry) => entry.view === view);
      return sample ? [sample] : [];
    }),
  );
</script>

<Card.Root size="sm">
  <Card.Header class="border-b">
    <div class="flex items-center gap-2">
      <Gauge class="size-5" aria-hidden="true" />
      <Card.Title>{text.settings.performance}</Card.Title>
      <Badge variant="outline">{$tabPerformanceSamples.length}</Badge>
    </div>
    <Card.Description>{text.settings.performanceDescription}</Card.Description>
  </Card.Header>
  <Card.Content class="gap-3">
    {#if latestByView.length === 0}
      <p class="text-sm text-muted-foreground">
        {text.settings.performanceEmpty}
      </p>
    {:else}
      <div class="grid gap-1">
        {#each latestByView as sample (sample.view)}
          <div class="flex min-h-10 items-center gap-3 border-b py-2 last:border-b-0">
            <span class="min-w-0 flex-1 truncate font-medium">
              {text.nav[sample.view]}
            </span>
            <Badge variant="secondary">
              {sample.cold
                ? text.settings.performanceCold
                : text.settings.performanceWarm}
            </Badge>
            <span class="tabular-nums text-sm text-muted-foreground">
              {Math.round(sample.readyPaintMs)} ms
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <Button
      variant="outline"
      size="sm"
      disabled={$tabPerformanceSamples.length === 0}
      onclick={clearTabPerformanceSamples}
    >
      <Trash2 aria-hidden="true" />
      {text.settings.performanceClear}
    </Button>
  </Card.Content>
</Card.Root>
