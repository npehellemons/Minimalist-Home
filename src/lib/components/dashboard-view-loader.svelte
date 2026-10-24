<script lang="ts">
  import { AlertCircle, RotateCcw } from "@lucide/svelte";
  import { tick, type Component } from "svelte";
  import type { DashboardView } from "#lib/dashboard-navigation.svelte.js";
  import {
    beginTabTransition,
    cancelTabTransition,
    completeTabTransition,
    markTabShellPainted,
  } from "#lib/performance-metrics.js";
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  type ViewModule = { default: Component<any> };

  let {
    view,
    active,
    workActive = active,
    load,
    viewProps = {},
    errorLabel,
    retryLabel,
  }: {
    view: DashboardView;
    active: boolean;
    workActive?: boolean;
    load: () => Promise<ViewModule>;
    viewProps?: Record<string, unknown>;
    errorLabel: string;
    retryLabel: string;
  } = $props();

  let LoadedView = $state<Component<any> | null>(null);
  let status = $state<"idle" | "loading" | "ready" | "error">("idle");
  let loadVersion = $state(0);
  let wasActive = false;

  function afterPaint() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function loadView() {
    if (status === "loading" || status === "ready") return;

    const version = ++loadVersion;
    status = "loading";
    beginTabTransition(view);

    await tick();
    await afterPaint();
    if (version !== loadVersion) return;
    markTabShellPainted(view);

    const importStartedAt = performance.now();

    try {
      const module = await load();
      if (version !== loadVersion) return;

      LoadedView = module.default;
      status = "ready";
      const importMs = performance.now() - importStartedAt;

      await tick();
      await afterPaint();
      if (version !== loadVersion) return;
      completeTabTransition(view, { cold: true, importMs });
    } catch (error) {
      console.error(`Unable to load the ${view} view`, error);
      cancelTabTransition(view);
      status = "error";
    }
  }

  function retry() {
    status = "idle";
    void loadView();
  }

  $effect(() => {
    const isActive = active;
    const currentStatus = status;

    if (!isActive) {
      if (wasActive) cancelTabTransition(view);
      wasActive = false;
      return;
    }

    if (wasActive) return;
    wasActive = true;

    if (currentStatus === "idle") {
      void loadView();
      return;
    }

    if (currentStatus === "ready") {
      beginTabTransition(view);
      void (async () => {
        await afterPaint();
        markTabShellPainted(view);
        completeTabTransition(view, { cold: false });
      })();
    }
  });
</script>

{#if status === "ready" && LoadedView}
  <LoadedView {...viewProps} active={workActive} />
{:else if status === "error"}
  <div class="grid h-full place-items-center p-4">
    <Alert.Root class="max-w-md">
      <AlertCircle aria-hidden="true" />
      <Alert.Title>{errorLabel}</Alert.Title>
      <Alert.Action>
        <Button variant="outline" size="sm" onclick={retry}>
          <RotateCcw aria-hidden="true" />
          {retryLabel}
        </Button>
      </Alert.Action>
    </Alert.Root>
  </div>
{:else}
  <div
    class="grid h-full min-h-0 gap-4 overflow-hidden bg-muted/30 p-4 md:grid-cols-2 md:p-6"
    aria-busy="true"
    aria-label={view}
  >
    <Skeleton class="h-20 md:col-span-2" />
    <Skeleton class="min-h-48" />
    <Skeleton class="min-h-48" />
  </div>
{/if}
