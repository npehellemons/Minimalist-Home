#!/system/bin/sh

URL="https://minimalist-home.vercel.app/"
FIREFOX_PACKAGE="org.mozilla.firefox"
FRAMEO_PACKAGE="net.frameo.frame"
LOG_FILE="/data/local/tmp/minimalist-home-kiosk.log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"
}

wait_for_boot() {
  until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 2
  done
}

wait_for_network() {
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    if ping -c 1 -W 1 1.1.1.1 >/dev/null 2>&1; then
      return
    fi
    attempts=$((attempts + 1))
    sleep 2
  done

  log "Network wait timed out; Firefox will use its cached dashboard if available"
}

enter_dashboard_fullscreen() {
  # The first tap opens the app's screensaver and requests browser fullscreen.
  # The second tap returns to the dashboard while retaining fullscreen.
  sleep 15
  input tap 40 168
  sleep 2
  input tap 640 400
}

launch_dashboard() {
  log "Launching dashboard in Firefox"
  am start -W -a android.intent.action.VIEW -d "$URL" -p "$FIREFOX_PACKAGE" >> "$LOG_FILE" 2>&1
  enter_dashboard_fullscreen
}

wait_for_boot

# This firmware restores its bundled launcher to enabled during every boot.
# Disable it only after Package Manager is ready, then stop its running process.
pm disable-user --user 0 "$FRAMEO_PACKAGE" >> "$LOG_FILE" 2>&1
am force-stop "$FRAMEO_PACKAGE"

# Keep the frame awake and locked to its natural 1280x800 landscape orientation.
svc power stayon true
settings put system screen_off_timeout 2147483647
settings put system accelerometer_rotation 0
settings put system user_rotation 0
settings put global policy_control immersive.full=*

wait_for_network
launch_dashboard

# Recover a killed browser without periodically refreshing a healthy dashboard.
while true; do
  sleep 30
  if ! pidof "$FIREFOX_PACKAGE" >/dev/null 2>&1; then
    log "Firefox process is no longer running"
    launch_dashboard
  fi
done
