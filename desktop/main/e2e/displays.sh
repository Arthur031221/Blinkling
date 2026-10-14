#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
export GLIMPSELET_REPORT_DIR="${GLIMPSELET_REPORT_DIR:-$PWD/test-results/desktop-shell}"
mkdir -p "$GLIMPSELET_REPORT_DIR"
# A dedicated Xorg dummy server supplies real RandR output hotplug; Xvfb cannot.
display="${GLIMPSELET_XORG_DISPLAY:-:9119}"
if [[ -e "/tmp/.X11-unix/X${display#:}" ]]; then
  echo "Display $display is already in use; set GLIMPSELET_XORG_DISPLAY." >&2
  exit 1
fi
"${GLIMPSELET_XORG:-/usr/lib/xorg/Xorg}" "$display" -ac \
  -config "$PWD/desktop/main/e2e/xorg-dummy.conf" \
  -logfile "$GLIMPSELET_REPORT_DIR/xorg.log" -noreset -nolisten tcp \
  +extension Composite > "$GLIMPSELET_REPORT_DIR/xorg-stdout.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$server"
export DISPLAY="$display" XAUTHORITY=/dev/null
xrandr --addmode DUMMY1 800x600
xrandr --output DUMMY1 --mode 800x600 --right-of DUMMY0
dbus-run-session -- bash -c '
set -euo pipefail
xfwm4 --compositor=on > "$GLIMPSELET_REPORT_DIR/display-wm.log" 2>&1 &
wm=$!
trap '\''kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true'\'' EXIT
sleep 2
kill -0 "$wm"
npx playwright test -c desktop/main/e2e/displays.config.mjs
'
