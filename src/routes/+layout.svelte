<script lang="ts">
  import './layout.css';
  import { ModeWatcher } from 'mode-watcher';
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
    const viewport = window.visualViewport;

    function updateViewportHeight() {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
    }

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    viewport?.addEventListener('resize', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      viewport?.removeEventListener('resize', updateViewportHeight);
      document.documentElement.style.removeProperty('--app-height');
    };
  });
</script>

<ModeWatcher />

<div class="app-viewport grid w-screen place-items-center overflow-hidden overscroll-none bg-background">
  <div
    class="device-shell relative overflow-hidden bg-background"
    data-device-width="1280"
    data-device-height="800"
  >
    {@render children()}
  </div>
</div>
