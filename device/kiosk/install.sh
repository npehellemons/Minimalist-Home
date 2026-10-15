#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEVICE_SCRIPT="/data/local/minimalist-home-kiosk.sh"

adb get-state >/dev/null
adb push "$SCRIPT_DIR/frameo-kiosk.sh" /data/local/tmp/minimalist-home-kiosk.sh
adb push "$SCRIPT_DIR/install-recovery.sh" /data/local/tmp/minimalist-home-install-recovery.sh
adb shell su 0 cp /data/local/tmp/minimalist-home-kiosk.sh "$DEVICE_SCRIPT"
adb shell su 0 chmod 0755 "$DEVICE_SCRIPT"

adb shell su 0 mount -o remount,rw /system
adb shell mount | grep -q '/system type ext4 (rw,'
adb shell su 0 cp /data/local/tmp/minimalist-home-install-recovery.sh /system/bin/install-recovery.sh
adb shell su 0 chmod 0755 /system/bin/install-recovery.sh
adb shell su 0 chcon u:object_r:install_recovery_exec:s0 /system/bin/install-recovery.sh
adb shell su 0 mount -o remount,ro /system
adb shell mount | grep -q '/system type ext4 (ro,'

echo "Kiosk startup installed. Reboot to verify Firefox launch and Frameo suppression."
