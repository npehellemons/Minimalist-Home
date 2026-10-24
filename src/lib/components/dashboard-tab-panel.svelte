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
      class="absolute inset-0 h-full w-full overflow-hidden text-sm outline-none"
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
