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
  import type { WeatherKind } from "#lib/weather.js";

  let {
    kind,
    isDay,
    class: className = "size-8",
  }: {
    kind: WeatherKind;
    isDay: boolean;
    class?: string;
  } = $props();
</script>

{#if kind === "clear"}
  {#if isDay}
    <Sun class={className} aria-hidden="true" />
  {:else}
    <Moon class={className} aria-hidden="true" />
  {/if}
{:else if kind === "partly-cloudy"}
  {#if isDay}
    <CloudSun class={className} aria-hidden="true" />
  {:else}
    <CloudMoon class={className} aria-hidden="true" />
  {/if}
{:else if kind === "cloudy"}
  <Cloud class={className} aria-hidden="true" />
{:else if kind === "fog"}
  <CloudFog class={className} aria-hidden="true" />
{:else if kind === "rain"}
  <CloudRain class={className} aria-hidden="true" />
{:else if kind === "snow"}
  <CloudSnow class={className} aria-hidden="true" />
{:else}
  <CloudLightning class={className} aria-hidden="true" />
{/if}
