<script lang="ts">
  import './layout.css';
  import { ModeWatcher } from 'mode-watcher';

  let { children } = $props();
</script>

<ModeWatcher />

<div class="grid min-h-screen min-h-dvh min-w-[1280px] place-items-center bg-background">
  <div
    class="relative h-[800px] w-[1280px] overflow-hidden bg-background"
    data-device-width="1280"
    data-device-height="800"
  >
    {@render children()}
  </div>
</div>
