<script lang="ts">
  import './layout.css';
  import { ModeWatcher } from 'mode-watcher';

  let { children } = $props();
</script>

<ModeWatcher />

<div class="grid h-screen h-dvh w-screen place-items-center overflow-hidden bg-background">
  <div
    class="relative overflow-hidden bg-background"
    style="width: min(1280px, 100vw, 160dvh); height: min(800px, 100dvh, 62.5vw);"
    data-device-width="1280"
    data-device-height="800"
  >
    {@render children()}
  </div>
</div>
