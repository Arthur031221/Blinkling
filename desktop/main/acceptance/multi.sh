#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
if [[ "${GLIMPSELET_ACCEPTANCE_MULTI:-}" != 1 ]]; then
  scratch=$(mktemp -d)
  server=''
  cleanup() {
    if [[ -n "${GLIMPSELET_REPORT_DIR:-}" ]]; then
      mkdir -p "$GLIMPSELET_REPORT_DIR"
      cp "$scratch/xorg.log" "$GLIMPSELET_REPORT_DIR/multi-xorg.log" 2>/dev/null || true
    fi
    if [[ -n "$server" ]]; then
      kill "$server" 2>/dev/null || true
      wait "$server" 2>/dev/null || true
    fi
    rm -rf "$scratch"
  }
  trap cleanup EXIT
  # The dummy server needs no console/VT. Avoid the hardware console wrapper.
  xorg=${GLIMPSELET_XORG_BIN:-/usr/lib/xorg/Xorg}
  "$xorg" -displayfd 3 -config "$PWD/desktop/main/acceptance/xorg.conf" \
    -noreset -nolisten tcp +extension Composite -logfile "$scratch/xorg.log" \
    3>"$scratch/display" >"$scratch/server.log" 2>&1 &
  server=$!
  for ((i=0; i<50; i++)); do
    [[ -s "$scratch/display" ]] && break
    kill -0 "$server" || { cat "$scratch/server.log"; exit 1; }
    sleep .1
  done
  [[ -s "$scratch/display" ]]
  export DISPLAY=":$(cat "$scratch/display")"
  dbus-run-session -- env GLIMPSELET_ACCEPTANCE_MULTI=1 \
    bash desktop/main/acceptance/multi.sh "$@"
  exit
fi
# Two real RandR outputs, rather than two descriptors in a renderer mock.
xrandr --addmode DUMMY1 1280x800
xrandr --output DUMMY0 --mode 1280x800 --primary \
  --output DUMMY1 --mode 1280x800 --right-of DUMMY0
xrandr --query
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/glimpselet-multi-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
xrandr --query
npx playwright test -c desktop/main/acceptance/multi.config.mjs "$@"
