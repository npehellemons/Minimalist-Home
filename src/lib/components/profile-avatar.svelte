<script lang="ts">
  import { Blobatar } from "@blobatar/svelte";
  import "blobatar/motion.css";

  import * as Avatar from "#lib/components/ui/avatar/index.js";
  import { cn } from "#lib/utils.js";

  let {
    name,
    size = "default",
    active = false,
    class: className,
  }: {
    name: string;
    size?: "sm" | "default" | "lg";
    active?: boolean;
    class?: string;
  } = $props();
</script>

<Avatar.Root {size} class={cn("bg-muted", className)}>
  <Blobatar
    name={name || "profile"}
    background="circle"
    animate="always"
    class="size-full"
  />
  {#if active}
    <Avatar.Badge class="bg-green-500" />
  {/if}
</Avatar.Root>
