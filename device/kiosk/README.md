# Frameo Firefox kiosk

This setup keeps Minimalist Home as a hosted web application. The device-side
script only starts Firefox after boot, suppresses the vendor launcher, keeps
the display awake, enters fullscreen, and reopens Firefox if Android kills its
process.

The launcher restores Firefox's selected tab instead of sending the production
URL on every start. Sending an `ACTION_VIEW` URL would create a duplicate tab
after every boot or recovery.

## Install

1. Connect the frame with USB debugging enabled.
2. Run `./device/kiosk/install.sh`.
3. Reboot and verify Firefox reaches the dashboard by itself.
4. Confirm `adb shell pm list packages -d` contains `net.frameo.frame`. The
   watchdog applies this after each boot because the firmware resets the flag.

## Restore

Run `./device/kiosk/restore.sh` while ADB is connected. This re-enables Frameo,
removes the kiosk startup hook, and restores automatic display rotation.

Device backups are stored under `device-backups/` and intentionally excluded
from Git because they contain APKs and device-specific state.
