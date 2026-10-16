<script lang="ts">
  import { Blobatar } from "@blobatar/svelte";
  import "blobatar/motion.css";

  import * as Avatar from "#lib/components/ui/avatar/index.js";
  import { cn } from "#lib/utils.js";

  let {
    name,
    color,
    size = "default",
    active = false,
    class: className,
  }: {
    name: string;
    color: string;
    size?: "sm" | "default" | "lg";
    active?: boolean;
    class?: string;
  } = $props();

  function contrastingEyeColor(hex: string) {
    const value = hex.replace("#", "");
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

    return luminance > 145 ? "#111111" : "#ffffff";
  }
</script>

<Avatar.Root {size} class={cn("bg-muted", className)}>
  <Blobatar
    name={name || "profile"}
    background="circle"
    palette={{ head: color, eye: contrastingEyeColor(color) }}
    animate="always"
    class="size-full"
  />
  {#if active}
    <Avatar.Badge class="bg-green-500" />
  {/if}
</Avatar.Root>
