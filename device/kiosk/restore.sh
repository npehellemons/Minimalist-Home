#!/bin/sh

set -eu

adb get-state >/dev/null
adb shell su 0 pkill -f /data/local/minimalist-home-kiosk.sh || true
adb shell pm enable net.frameo.frame
adb shell su 0 mount -o remount,rw /system
adb shell mount | grep -q '/system type ext4 (rw,'
adb shell su 0 rm -f /system/bin/install-recovery.sh
adb shell su 0 mount -o remount,ro /system
adb shell mount | grep -q '/system type ext4 (ro,'
adb shell su 0 rm -f /data/local/minimalist-home-kiosk.sh
adb shell settings delete global policy_control
adb shell settings put system accelerometer_rotation 1

echo "Frameo and the original Android display behavior have been restored."
