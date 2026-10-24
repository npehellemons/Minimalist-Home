# Low-Hardware Performance Audit

This document records the current performance findings and the implementation
order for making Minimalist Home responsive on the Frameo tablet. It complements
`DEVICE_DEPLOYMENT_PLAN.md` and should be updated with measurements as each phase
lands.

## Executive Summary

The slow tab changes are not primarily caused by waiting for a network response.
The tab value changes synchronously, but the current dashboard eagerly imports and
mounts Home, Calendar, Tasks, and Settings. Bits UI keeps inactive tab panels in
the DOM with the native `hidden` attribute. On the tablet, the first load therefore
pays to parse and initialize every view, while returning to a hidden heavy view can
trigger a large style, layout, and paint burst before the new screen appears.

Skeletons will improve perceived speed only when the browser gets an opportunity
to paint them before heavy work begins. The first implementation should therefore
combine:

1. Lazy view imports and first-use mounting.
2. An immediate, small Shadcn Skeleton shell.
3. A browser-frame yield before importing or initializing a heavy view.
4. Retaining already visited views with rendering suppressed, subject to measured
   memory limits.
5. Shared task and calendar data stores so views do not independently fetch,
   subscribe, and parse the same data.

The service worker and API caches already make repeat network access inexpensive.
The main opportunity is reducing JavaScript evaluation, duplicated work, DOM size,
image decode cost, and main-thread rendering.

## Measured Baseline

Measured from the production build and tablet inspection on 2026-10-18:

| Item | Current value |
| --- | --- |
| Tablet CPU | Rockchip RK3326, 32-bit Cortex-A53 class |
| Tablet memory | 976,904 kB physical memory |
| Tablet browser | Firefox 157.0.1 on Android 8.1 |
| Browser PSS while dashboard is open | Approximately 297 MB across Firefox processes |
| Largest dashboard JavaScript chunk | 564,902 bytes raw, approximately 159 kB gzip |
| Largest shared JavaScript chunk | 470,850 bytes raw, approximately 134 kB gzip |
| Largest CSS asset | 103,709 bytes raw |
| Warm tab-change target | Visible completion within 250 ms |

Source-map inspection shows that the dashboard chunk contains iCalendar parsing,
Temporal polyfills, FullCalendar, and all four main views. The shared chunk contains
the full Supabase browser client and UI dependencies. Transfer size is acceptable,
but parsing and executing this code is expensive on the tablet CPU.

## Implementation Status

Completed on 2026-10-18:

- Added bounded, device-local measurements for first-load and revisit tab timing.
- Added a compact bilingual performance diagnostics card in Settings.
- Replaced eager view imports with first-use dynamic imports.
- Added a compact Shadcn Skeleton that is painted before the dynamic import begins.
- Added per-view load failure handling and retry.
- Preserved mounted view state after a view has loaded.
- Replaced inactive native `hidden` panels with retained, inert panels using
  `content-visibility: hidden`.
- Paused Home, Tasks, Calendar, photo-library, weather, and clock background work
  while their view or the browser document is inactive.
- Limited continuous Blobatar animation to the active profile in the top bar.
- Batched FullCalendar setting mutations and refresh cached feeds when returning
  to the Calendar view.
- Replaced the independent Home and Tasks task loaders with one household/day
  store that deduplicates requests, owns optimistic state, and uses one Realtime
  channel.
- Paused the shared task Realtime channel while the document is hidden and
  refreshes the cached day once when the dashboard becomes visible again.
- Added a bounded persistent task snapshot per household. A matching current-day
  snapshot renders before Supabase responds, then refreshes in the background.
- Replaced FullCalendar's separate raw-ICS plugin path with a range-based event
  source backed by the same normalized `ical.js` parser used by Home.
- Bounded normalized calendar results to eight date ranges per feed and retained
  profile color, calendar, and location metadata in the shared event records.

The production build now emits Home, Calendar, Tasks, and Settings as separate
dynamic entries. The dashboard route entry fell from 564,902 bytes raw to 10,620
bytes raw. FullCalendar remains the largest optional entry at approximately
284,000 bytes raw and is no longer evaluated before Calendar is first opened.

Physical-tablet measurements remain outstanding. The values collected on a desktop
are useful for regression testing but are not a substitute for the release target.

## Current Bottlenecks

### 1. Every main view mounted at startup (resolved)

`src/routes/(dashboard)/+page.svelte` statically imports every dashboard view.
Bits UI's tab content remains mounted while inactive and uses `hidden` for display.
Consequences:

- FullCalendar initializes before the user opens Calendar.
- Settings loads profile and photo-library UI before it is needed.
- Home and Tasks both load daily tasks and establish their own subscriptions.
- Home and Calendar both parse calendar data for different consumers.
- The browser constructs and retains all view DOM trees.

### 2. Task work was duplicated (resolved)

Home and Tasks now derive their records from one layout-scoped task store. The
store issues one set of task, assignment, and completion queries per household/day,
joins concurrent requests, preserves the latest data between tab changes, and owns
one debounced Realtime channel.

### 3. Calendar parsing was duplicated (resolved)

Home and FullCalendar now request normalized events through the same calendar
service. FullCalendar asks for its visible range instead of parsing raw Blob URLs,
and recently used ranges are retained in a bounded in-memory cache.

### 4. Revealing a hidden view is expensive

Native `hidden` maps to `display: none`. The browser cannot preserve the rendered
state of an inactive panel, so showing a complex calendar or settings tree can
require style calculation, layout, and paint during the tap. On a low-end CPU this
can look as though navigation itself is waiting.

### 5. Continuous and image-related work adds pressure

- Every `ProfileAvatar` currently requests an always-animated Blobatar. Lists and
  hidden views can contain many continuously animated SVGs.
- Photo uploads may be up to 10 MB and the slideshow preloads the next original.
  Decoded image memory depends on pixel dimensions, not compressed file size; two
  modern phone photos can consume tens of megabytes each when decoded.
- The service worker precaches every generated immutable asset, including all font
  subsets, which increases initial install work and cache storage.

## Implementation Plan

### Phase 1: Instrument Before Changing Behavior

- Add performance marks for pointer input, active-tab update, first painted shell,
  and view-ready state.
- Measure cold first visit and warm revisit separately for every tab.
- Store only the most recent bounded sample set in local storage and expose a
  compact diagnostics section in Settings.
- Record long tasks, calendar parse duration, image decode duration, and memory
  before and after visiting every view where browser APIs permit it.
- Use desktop CPU throttling for repeatable regression checks, but use Firefox
  remote debugging on the physical tablet as the release authority.

Initial targets:

| Interaction | Target |
| --- | --- |
| Tab indicator response | Under 50 ms |
| Loading shell visible | Under 100 ms |
| Warm visited view visible | Under 250 ms |
| Cold Calendar usable | Under 1,000 ms, with immediate shell |
| Main-thread task during interaction | Prefer under 50 ms |

### Phase 2: Lazy-Mount Views With Immediate Shells

- Keep Home as the initial view, but load Calendar, Tasks, and Settings with dynamic
  imports when first selected.
- Replace eager Bits UI panel children with a small view host that tracks selected
  and visited views.
- On first selection, update the active indicator, render a small Shadcn Skeleton
  shell, then yield through `requestAnimationFrame` before importing the view.
- Do not use a large field-by-field skeleton. Three to five stable blocks are less
  expensive to render and avoid a second major layout change.
- Begin an idle preload of the most likely next view only after Home is ready. Use
  feature detection and a timeout fallback rather than depending on
  `requestIdleCallback`.
- Add an error boundary and retry action per lazy view so a failed chunk does not
  blank the dashboard.

Dynamic imports also let Vite produce separate view chunks and preload shared
dependencies without serial network round trips.

### Phase 3: Make Repeat Visits Cheap

- Keep a visited view mounted after its first successful load.
- Suppress inactive view rendering with `content-visibility: hidden` rather than
  native `hidden`, and apply `aria-hidden` plus `inert` so inactive controls cannot
  receive focus or touch input.
- Provide a stable intrinsic size so restoring a panel does not shift the shell.
- Pause view-specific timers, observers, and animations while a view is inactive.
- If real-device measurements show unacceptable memory after all views are opened,
  use an LRU policy that retains Home and the most recently used heavy view. Do not
  unmount FullCalendar on every tab change by default, because recreating it makes
  warm navigation slower.
- Use `content-visibility: auto` and `contain-intrinsic-size` for long offscreen
  Settings sections where appropriate.

This strategy improves startup compared with the current eager mount while keeping
repeat navigation fast. Its steady-state memory is no worse than today's behavior
unless an LRU policy is enabled.

### Phase 4: Centralize Shared Data Work

Tasks:

- [x] Create one household task store that owns the fetch, cache, optimistic updates,
  and one Realtime channel.
- [x] Let Home and Tasks derive filtered projections from the same normalized records.
- [x] Add a small persistent stale-while-revalidate cache so the last task state can
  render immediately after restart.
- Consider a `get_daily_tasks` database function after client deduplication is in
  place, reducing three REST requests to one. This is an optimization, not the
  first fix.

Calendar:

- [x] Create one calendar service that caches raw feeds and normalized events.
- [x] Parse each unchanged feed/range once and serve both Home and FullCalendar from the
  normalized event cache.
- [x] Give FullCalendar an events function that returns only the requested date range.
- Move iCalendar parsing to a Web Worker if device traces still show long tasks.
- Batch FullCalendar option and event-source mutations with `batchRendering()` and
  use a short `rerenderDelay` to coalesce asynchronous updates.
- Keep `progressiveEventRendering` disabled unless measurement proves otherwise;
  waiting for sources avoids repeated rerenders.

### Phase 5: Remove Continuous and Oversized Work

- Animate Blobatars only in prominent active/header contexts. Use static Blobatars
  in task lists, Settings, and hidden panels, while preserving profile colors.
- Stop animations when the document or containing view is inactive and respect
  reduced-motion preferences.
- Resize/compress photo uploads to a dashboard-sized display variant and generate
  a small thumbnail for Settings. Do not decode original multi-megapixel photos for
  a 1280 x 800 display.
- Mark noncritical images for lazy loading and asynchronous decoding. Explicitly
  decode the next slideshow image before swapping it in.
- Import only the Latin Inter font subset used by the supported languages.
- Pause scheduled refreshes while `document.hidden`; on return, refresh only stale
  data and keep displaying cached values during refresh.

### Phase 6: Service Worker and Reliability Review

- Keep immutable hashed assets cache-first and HTML/service-worker files
  revalidated; this part is already sound.
- Split the app before changing precache policy. Once split, precache the shell and
  initial Home route, then warm optional view chunks after startup instead of
  installing every optional asset at once.
- Bound every persistent cache by age and count.
- Add cache version migration and recovery so a bad cached response cannot trap the
  dashboard on a blank screen.
- Never use periodic full-page reloads as a performance strategy.

## Recommended Delivery Order

1. Add tab timing and real-device baseline capture.
2. Introduce lazy view hosting, Shadcn Skeleton shells, and frame yielding.
3. Add retained visited panels with rendering and activity suppression.
4. Centralize task queries and Realtime subscriptions.
5. Centralize normalized calendar parsing and range delivery.
6. Optimize animated avatars, photos, and font subsets.
7. Review service-worker precaching after the bundle has been split.
8. Run a 24-hour memory and reliability soak test on the tablet.

Each step should ship independently and be compared with the previous tablet
measurement. Avoid combining view splitting, data-store migration, and worker
parsing into one release because regressions would be difficult to isolate.

## Approaches Not Recommended Yet

- More zram before app-level memory and rendering work is measured. Extra compressed
  memory can increase CPU pressure on this processor.
- Replacing Postgres Changes with Supabase Broadcast solely for performance. A
  household has low event volume; removing duplicate channels is the meaningful
  first step.
- Clearing or bypassing caches on every release. Hashed assets already make normal
  cache invalidation reliable.
- A complex animated skeleton. It competes for the same limited rendering budget.
- Destroying every inactive view immediately. That reduces memory but sacrifices the
  fast warm-switch behavior the dashboard needs.

## Research References

- [Vite dynamic imports and async chunk loading](https://vite.dev/guide/features.html#dynamic-import)
- [MDN: `content-visibility`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility)
- [web.dev: rendering performance with `content-visibility`](https://web.dev/articles/content-visibility)
- [web.dev: optimize long tasks](https://web.dev/articles/optimize-long-tasks)
- [Chrome DevTools performance and CPU throttling](https://developer.chrome.com/docs/devtools/performance)
- [FullCalendar `batchRendering`](https://fullcalendar.io/docs/Calendar-batchRendering)
- [FullCalendar `rerenderDelay`](https://fullcalendar.io/docs/rerenderDelay)
- [FullCalendar event-source function](https://fullcalendar.io/docs/events-function)
- [FullCalendar progressive event rendering](https://fullcalendar.io/docs/progressiveEventRendering)
- [Supabase Realtime database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Realtime channel cleanup](https://supabase.com/docs/guides/realtime/getting_started)
- [MDN: asynchronous image decoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decoding)
- [MDN: `requestIdleCallback` compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback)
