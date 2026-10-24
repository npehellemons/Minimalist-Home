# Device Deployment and Performance Plan

This is the working plan for turning the Frameo tablet and Minimalist Home web app into a fast, reliable household appliance. Update the checkboxes, measurements, and decision log as work progresses.

## Goal

Run Minimalist Home continuously in a modern browser with:

- Fast startup and tab changes
- No browser chrome during normal use
- Useful behavior during network or API outages
- Predictable memory use over multiple days
- Automatic recovery after power loss or browser failure
- A reversible device configuration

## Current Baseline

Measured on 2026-10-15:

| Item | Current value |
| --- | --- |
| Device platform | Rockchip RK3326, 32-bit ARM, Cortex-A53 class |
| Android | 8.1.0 / API 27 |
| Android security patch | 2020-06-05 |
| Browser | Firefox 157.0.1 |
| Physical memory | 976,904 kB |
| Available memory during dashboard use | Approximately 263 MB |
| zram | 368,936 kB, approximately 194 MB used |
| Swappiness | 100 |
| Data storage | Approximately 24 GB free |
| Static build size | Approximately 1.1 MB |
| Largest app chunk | 443 kB raw / approximately 126 kB gzip |
| Firefox main-process PSS | Approximately 210 MB |
| Firefox main-process SwapPSS | Approximately 76 MB |
| Weather refresh interval | 15 minutes |
| Calendar refresh interval | 30 minutes |

The production address is `https://minimalist-home.vercel.app/`. The local address, `http://192.168.86.193:4174/`, remains useful for development but is not a production PWA origin and cannot provide normal service-worker guarantees.

## Success Criteria

Do not optimize by feel alone. The finished setup should meet these targets:

- Cold boot reaches the dashboard without manual interaction.
- Warm tab changes visibly complete within 250 ms.
- Returning to an already-used tab does not refetch weather or calendar data.
- The dashboard starts with cached data when APIs are unavailable.
- A temporary network outage never produces a permanently blank screen.
- Browser memory reaches a stable plateau during a 24-hour test.
- The system recovers from a killed Firefox process within 60 seconds.
- Power cycling the tablet restores the dashboard automatically.
- There is a documented way to restore every disabled Android package.

## Phase 0: Preserve and Measure

Purpose: create a recovery point before changing the operating system.

- [ ] Save the exact Firefox APK currently installed on the tablet.
- [ ] Record `pm list packages -f` before disabling anything.
- [ ] Record all currently enabled third-party and vendor packages.
- [ ] Save relevant Android settings and system properties.
- [ ] Record current Firefox process memory after a fresh boot.
- [ ] Record memory again after opening Calendar, Tasks, Settings, and Screensaver.
- [ ] Confirm `pnpm check` and `pnpm build` pass.
- [ ] Store recovery files outside the tablet.

Artifacts to keep:

- Firefox 157.0.1 APK
- Package inventory
- Disabled-package restore script
- Device property snapshot
- Baseline memory report
- Screenshots of the working dashboard

Phase complete when the current working state can be restored without downloading an unknown browser version.

## Phase 1: Production HTTPS Hosting

Purpose: establish a stable, secure origin that can use the service worker and be installed as a web app.

- [x] Choose a static host with HTTPS and atomic deployments.
- [x] Connect a dedicated domain or subdomain.
- [x] Configure the host to publish the SvelteKit `build` directory.
- [x] Configure long-lived immutable caching for hashed assets.
- [x] Configure HTML and the service worker to revalidate instead of being cached forever.
- [x] Deploy the current production build.
- [x] Verify the manifest, icons, and service worker over HTTPS.
- [x] Verify the site is served from a secure HTTPS origin.
- [ ] Verify the dashboard reloads after the network is disconnected.
- [x] Confirm a new Git deployment replaces the production deployment cleanly.

Suggested cache policy:

| Resource | Policy |
| --- | --- |
| `/_app/immutable/*` | `public, max-age=31536000, immutable` |
| HTML | `no-cache` |
| `service-worker.js` | `no-cache` |
| Manifest and icons | Short cache or revalidation |

Phase complete when the HTTPS version works online, starts offline after one visit, and updates cleanly.

## Phase 2: Install as a Firefox Web App

Purpose: remove ordinary browser UI and isolate the dashboard from normal browsing.

- [ ] Open the production HTTPS URL in Firefox.
- [ ] Confirm Firefox offers **Install**, not only a generic bookmark shortcut.
- [ ] Install the web app from the Firefox menu.
- [ ] Launch it from its installed icon.
- [ ] Verify the address bar and tabs are absent.
- [ ] Confirm the display remains landscape at 1280 x 800.
- [ ] Confirm touch, dark mode, screensaver, and scrolling still work.
- [ ] Close all unrelated Firefox tabs.
- [ ] Disable Firefox Sync and remove personal browser accounts.
- [ ] Disable unnecessary Firefox notifications, recommendations, and telemetry where available.

Keep hardware acceleration enabled. Do not apply speculative `about:config` changes yet.

Phase complete when the installed dashboard behaves like a standalone app for a full day.

## Phase 3: Split Heavy Application Views

Purpose: reduce startup parsing and make both first visits and repeat visits fast.

The detailed investigation and implementation order live in
`docs/PERFORMANCE_AUDIT.md`.

- [ ] Add tab-switch timing and collect a baseline on the physical tablet.
- [x] Move Home, Calendar, Tasks, and Settings into separately loaded view chunks.
- [x] Keep the device shell, profile selection, clock, and shared weather store in the dashboard layout.
- [x] Load FullCalendar only when Calendar is first opened.
- [x] Paint a small Shadcn Skeleton shell before loading a view for the first time.
- [x] Retain visited views and suppress inactive rendering with `content-visibility`.
- [x] Pause inactive view timers, observers, subscriptions, and animations.
- [ ] Add an LRU unmount policy only if tablet memory measurements require it.
- [x] Preserve normalized calendar data independently from the rendered calendar instance.
- [ ] Preload likely views only after the initial dashboard becomes idle.
- [ ] Confirm profile selection continues to affect every view except Settings.
- [ ] Compare production bundle chunks before and after the change.
- [ ] Measure cold startup and tab-switch latency on the tablet.
- [ ] Measure browser memory after visiting every view.

Phase complete when Calendar is no longer part of the initial dashboard JavaScript
path, first-use skeletons paint promptly, and warm tab changes visibly complete
within 250 ms on the tablet.

## Phase 4: Calendar and Weather Work Scheduling

Purpose: keep network and parsing work away from user interactions.

Already implemented:

- [x] Share one weather response between the header and screensaver.
- [x] Refresh weather at most every 15 minutes.
- [x] Cache weather persistently and retain stale data after errors.
- [x] Refresh calendar feeds at most every 30 minutes.
- [x] Cache calendar feeds persistently and deduplicate requests.
- [x] Avoid reparsing an unchanged mounted calendar source.

Remaining work:

- [x] Pause scheduled refreshes while the document is hidden.
- [x] On visibility return, refresh through the existing stale-aware caches.
- [x] Share one daily-task cache and Realtime channel between Home and Tasks.
- [x] Render the latest current-day task snapshot while Supabase revalidates it.
- [ ] Add exponential retry backoff with jitter.
- [ ] Track last-attempt and last-success timestamps separately.
- [x] Normalize iCalendar data once and cache the normalized result.
- [ ] Move expensive iCalendar parsing to a Web Worker if profiling shows long main-thread tasks.
- [x] Limit rendered events to the date range FullCalendar requests.
- [ ] Place explicit size and age limits on persistent caches.
- [ ] Add a diagnostic view for cache age and fetch errors.

Phase complete when opening a view never competes with an unnecessary background refresh.

## Phase 5: Reversible Android Cleanup

Purpose: free memory and stop background work without modifying system partitions.

Rules:

- Disable packages before considering removal.
- Change one group at a time and reboot-test after each group.
- Record the package name and restore command for every change.
- Keep ADB available until the complete boot flow has passed its soak test.

Candidate groups to audit:

- [ ] Frameo application and its background workers
- [ ] Fully Kiosk after the Firefox setup replaces it
- [ ] Factory stress-test application
- [ ] Factory device-test application
- [ ] Vendor update and advertising services
- [ ] Unused photo, media-scanning, Bluetooth, telephony, and printing components
- [ ] Unused keyboard only after another maintenance input method is proven

Do not disable core components such as System UI, Package Installer, Settings, Wi-Fi services, display services, or Firefox dependencies without a tested recovery route.

After every cleanup group:

- [ ] Reboot.
- [ ] Confirm Wi-Fi reconnects.
- [ ] Confirm touch and display work.
- [ ] Confirm the dashboard launches.
- [ ] Capture available memory and active process counts.
- [ ] Restore the group immediately if behavior regresses.

Phase complete when only necessary services remain and all changes have matching restore commands.

## Phase 6: Boot, Kiosk, and Recovery Flow

Purpose: make the tablet recover without human intervention.

- [ ] Wait for Android boot completion.
- [ ] Wait for a working network route with a bounded timeout.
- [ ] Launch the installed dashboard automatically.
- [ ] Keep the display awake while powered.
- [ ] Keep the tablet in landscape orientation.
- [ ] Suppress navigation and status bars during normal operation.
- [ ] Relaunch Firefox only when its process has exited or the app is genuinely unhealthy.
- [ ] Avoid periodic blind page reloads.
- [ ] Restart Firefox once during a quiet nightly window if soak testing shows memory growth.
- [ ] Reboot the tablet weekly only if it improves measured stability.
- [ ] Provide a maintenance escape path for ADB and settings access.

Implementation lives in `device/kiosk/`. The firmware's existing
`install-recovery.sh` init hook starts a root-owned watchdog without packaging
the dashboard as an Android application. Run `device/kiosk/restore.sh` over ADB
to remove it and restore Frameo.

Android lock-task mode is the strongest kiosk option, but on Android 8.1 it requires device-owner/DPC setup for a fully managed device. First determine whether the installed Firefox web app plus root boot automation is sufficient before adding a custom DPC.

Phase complete after power loss, Wi-Fi loss, browser termination, and server outage have each been tested successfully.

## Phase 7: App-Level Reliability

Purpose: make failures understandable and recoverable instead of blank.

- [ ] Show cached content during API failures.
- [ ] Add a subtle offline indicator.
- [ ] Show last-success information in a diagnostic area, not the normal dashboard UI.
- [ ] Detect and report failed service-worker updates.
- [ ] Add a controlled “reload application” action in Settings.
- [ ] Add the build version and deployment timestamp to diagnostics.
- [ ] Guard against duplicate timers and subscriptions during navigation.
- [ ] Log recent recoverable errors in a bounded local ring buffer.
- [ ] Never allow diagnostics or logs to grow without a size limit.

Phase complete when common failures can be diagnosed locally without connecting developer tools.

## Phase 8: Memory Tuning

Purpose: tune the device only after unnecessary application and Android memory use has been removed.

- [ ] Repeat the baseline measurements after Phases 3 through 7.
- [ ] Confirm whether Firefox memory stabilizes during a 24-hour run.
- [ ] Test the existing 369 MB zram configuration first.
- [ ] If memory pressure remains, trial approximately 512 MB zram.
- [ ] Compare interaction latency, swap use, CPU load, and process kills.
- [ ] Keep the configuration that performs better under real dashboard use.

Do not add disk-backed swap on the tablet's NAND. Do not enlarge zram merely to make the reported swap number larger; compressed-memory pressure can cost more CPU than it saves.

Phase complete when the selected configuration has measurements showing it is better than the baseline.

## Phase 9: Soak Test and Release

Purpose: prove the complete appliance setup before considering it finished.

Run for at least 24 hours, then preferably seven days.

- [ ] Sample browser and system memory periodically.
- [ ] Exercise every tab and profile.
- [ ] Enter and leave screensaver mode repeatedly.
- [ ] Cross midnight and verify the hourly forecast.
- [ ] Allow at least one weather and calendar refresh cycle.
- [ ] Disconnect Wi-Fi and restore it.
- [ ] Make the hosting origin temporarily unavailable.
- [ ] Kill Firefox and verify recovery.
- [ ] Power-cycle the tablet and verify unattended startup.
- [ ] Deploy a new application version and verify controlled activation.
- [ ] Review logs for repeated failures or growing data.

Release is accepted when all success criteria pass without manual repair.

## Ongoing Release Procedure

For every dashboard update:

1. Run `pnpm check`.
2. Run `pnpm build`.
3. Test the production build locally.
4. Deploy atomically to the HTTPS host.
5. Verify the new version on a normal browser.
6. Let the tablet update through the service worker.
7. Confirm weather, calendar, settings, and screensaver behavior.
8. Keep the previous deployment available for rollback.

For every Firefox update:

1. Preserve the currently working APK.
2. Confirm the new release still supports Android 8.1 and 32-bit ARM.
3. Test it separately before replacing the kiosk browser.
4. Repeat cold-start, memory, rendering, PWA, and 24-hour checks.
5. Roll back immediately if rendering or memory behavior regresses.

## Decision Log

| Date | Decision | Reason | Result |
| --- | --- | --- | --- |
| 2026-10-15 | Use a static SvelteKit build instead of Capacitor | The frame can run the dashboard directly in a browser | In progress |
| 2026-10-15 | Use Firefox instead of the old system WebView | Firefox provides a current rendering engine on Android 8.1 | Working |
| 2026-10-15 | Cache weather for 15 minutes | Avoid API churn while keeping conditions current | Verified |
| 2026-10-15 | Cache calendars for 30 minutes | Avoid repeated downloads and iCalendar parsing | Verified |
| 2026-10-15 | Defer swap changes | Application and background-process improvements should be measured first | Pending |
| 2026-10-15 | Use Vercel for production hosting | Provides HTTPS, atomic static deployments, preview builds, and a small calendar proxy function | Working |

## Next Action

Start with **Phase 0: Preserve and Measure**. Do not disable additional packages or change zram until the recovery artifacts and full baseline have been saved.
