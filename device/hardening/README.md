# Device hardening

Package cleanup is applied in small, reversible groups. Capture a baseline with
`device/capture-baseline.sh` before changing a device.

Disable a group:

```sh
./device/hardening/disable-group.sh device/hardening/package-groups/factory-tests.txt
```

Restore the same group:

```sh
./device/hardening/restore-group.sh device/hardening/package-groups/factory-tests.txt
```

After each group, reboot and verify ADB, Wi-Fi, display, touch, Firefox, the
dashboard, and available memory before continuing.

## Results

- `factory-tests.txt`: package disable does not suppress these manifest-level
  persistent processes on this firmware. Their original enabled state was
  restored. Do not retry without a separately reviewed system-APK strategy.
- `vendor-updaters.txt`: disables the obsolete ADUPS and Rockchip updater
  services. Their APKs were preserved and both processes remained absent after
  reboot while Wi-Fi, Firefox, and the dashboard recovered normally.

## Kiosk note

The screensaver button moved from `(136, 228)` to `(136, 168)`. On this Firefox
and touchscreen combination, the first synthetic tap focuses the button and a
second tap activates it. The kiosk startup therefore uses two taps at the button
followed by one center-screen tap to return to the dashboard in fullscreen.
