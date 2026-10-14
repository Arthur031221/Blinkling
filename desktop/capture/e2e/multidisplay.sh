#!/usr/bin/env bash
set -euo pipefail
# Requires Xorg's dummy driver, xfwm4 and XRandR. The server allocates its own
# display number and never changes the user's graphical session.
cd "$(dirname "$0")/../../.."
taskdir=$(mktemp -d /tmp/glimpselet-b3-multi.XXXXXX)
reports=${GLIMPSELET_REPORT_DIR:-"$PWD/test-results/capture-guide"}
mkdir -p "$reports"
xserver=
cleanup() {
  if [[ -n "$xserver" ]]; then
    kill "$xserver" 2>/dev/null || true
    wait "$xserver" 2>/dev/null || true
  fi
  rm -rf "$taskdir"
}
trap cleanup EXIT
/usr/lib/xorg/Xorg -noreset -nolisten tcp -displayfd 3 \
  -config "$PWD/desktop/capture/e2e/multidisplay.conf" \
  -logfile "$reports/xorg.log" 3> "$taskdir/display" > "$reports/xorg-stdout.log" 2>&1 &
xserver=$!
for ((i=0;i<100;i++)); do
  [[ -s "$taskdir/display" ]] && break
  kill -0 "$xserver"
  sleep .05
done
test -s "$taskdir/display"
export DISPLAY=":$(cat "$taskdir/display")"
export GLIMPSELET_REPORT_DIR="$reports"
dbus-run-session -- bash -c '
  set -euo pipefail
  xfwm4 --compositor=on > "$GLIMPSELET_REPORT_DIR/multi-wm.log" 2>&1 &
  wm=$!
  trap '\''kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true'\'' EXIT
  sleep 2
  kill -0 "$wm"
  xrandr --addmode DUMMY1 800x900
  xrandr --output DUMMY0 --mode 800x900 --pos 0x0 \
    --output DUMMY1 --primary --mode 800x900 --pos 800x0
  xrandr --query > "$GLIMPSELET_REPORT_DIR/multi-xrandr.txt"
  sleep 1
  node desktop/capture/e2e/multidisplay.probe.mjs
'
