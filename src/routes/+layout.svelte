<script lang="ts">
  import './layout.css';
  import { ModeWatcher } from 'mode-watcher';

  let { children } = $props();
</script>

<ModeWatcher />

<div class="grid h-screen h-dvh w-screen place-items-center overflow-hidden bg-background">
  <div
    class="device-shell relative overflow-hidden bg-background"
    data-device-width="1280"
    data-device-height="800"
  >
    {@render children()}
  </div>
</div>
