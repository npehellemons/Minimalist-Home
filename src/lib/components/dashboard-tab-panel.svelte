<script lang="ts">
  import type { Snippet } from "svelte";
  import type { DashboardView } from "#lib/dashboard-navigation.svelte.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";

  let {
    value,
    active,
    children,
  }: {
    value: DashboardView;
    active: boolean;
    children: Snippet;
  } = $props();
</script>

<Tabs.Content {value}>
  {#snippet child({ props })}
    <div
      {...props}
      role="tabpanel"
      class="absolute inset-x-0 top-0 bottom-[var(--mobile-nav-height)] w-full overflow-hidden text-sm outline-none md:bottom-0"
      hidden={undefined}
      aria-hidden={!active}
      inert={!active}
      tabindex={active ? 0 : -1}
      style:content-visibility={active ? "visible" : "hidden"}
      style:contain-intrinsic-size="100% 100%"
    >
      {@render children()}
    </div>
  {/snippet}
</Tabs.Content>
