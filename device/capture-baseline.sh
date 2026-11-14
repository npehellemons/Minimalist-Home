#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_DIR="${ROOT_DIR}/device-backups/${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}/apks"

adb get-state >/dev/null

capture_shell() {
  local output="$1"
  shift
  adb shell "$@" >"${BACKUP_DIR}/${output}" 2>&1 || true
}

capture_root_shell() {
  local output="$1"
  shift
  adb shell su 0 "$@" >"${BACKUP_DIR}/${output}" 2>&1 || true
}

capture_shell device-properties.txt getprop
capture_shell kernel.txt uname -a
capture_shell cpuinfo.txt cat /proc/cpuinfo
capture_shell meminfo.txt cat /proc/meminfo
capture_shell vmstat.txt cat /proc/vmstat
capture_shell swaps.txt cat /proc/swaps
capture_shell disk-usage.txt df -h
capture_shell mounts.txt mount
capture_shell processes.txt ps -A
capture_shell process-memory.txt dumpsys meminfo
capture_shell cpu-usage.txt dumpsys cpuinfo
capture_shell activity-processes.txt dumpsys activity processes
capture_shell activity-top.txt dumpsys activity top
capture_shell power.txt dumpsys power
capture_shell battery.txt dumpsys battery
capture_shell display.txt dumpsys display
capture_shell package-inventory.txt pm list packages -f
capture_shell package-third-party.txt pm list packages -3 -f
capture_shell package-system.txt pm list packages -s -f
capture_shell package-disabled.txt pm list packages -d
capture_shell package-enabled.txt pm list packages -e
capture_shell settings-global.txt settings list global
capture_shell settings-secure.txt settings list secure
capture_shell settings-system.txt settings list system
capture_shell firefox-package.txt dumpsys package org.mozilla.firefox
capture_shell chrome-package.txt dumpsys package com.android.chrome
capture_shell frameo-package.txt dumpsys package net.frameo.frame
capture_shell zram-size.txt cat /sys/block/zram0/disksize
capture_shell zram-stats.txt cat /sys/block/zram0/mm_stat
capture_shell swappiness.txt cat /proc/sys/vm/swappiness
capture_root_shell root-id.txt id
capture_root_shell kiosk-script.txt cat /data/local/minimalist-home-kiosk.sh
capture_root_shell install-recovery.txt cat /system/bin/install-recovery.sh
capture_root_shell kiosk-log.txt cat /data/local/tmp/minimalist-home-kiosk.log

BACKUP_PACKAGES=(
  org.mozilla.firefox
  com.android.chrome
  net.frameo.frame
  de.ozerov.fully
  com.adups.fota
  android.rockchip.update.service
  com.cghs.stresstest
  com.DeviceTest
)

for package in "${BACKUP_PACKAGES[@]}"; do
  while IFS= read -r apk_path; do
    apk_path="${apk_path#package:}"
    if [[ -n "${apk_path}" ]]; then
      apk_name="${package}-$(basename "${apk_path}")"
      adb pull "${apk_path}" "${BACKUP_DIR}/apks/${apk_name}" >/dev/null 2>&1 || true
    fi
  done < <(adb shell pm path "${package}" 2>/dev/null | tr -d '\r')
done

(
  cd "${BACKUP_DIR}"
  find . -type f -print0 | sort -z | xargs -0 shasum -a 256 >SHA256SUMS
)

printf 'Baseline saved to %s\n' "${BACKUP_DIR}"
