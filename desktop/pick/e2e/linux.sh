#!/usr/bin/env bash
set -euo pipefail
# Run as: xvfb-run -a -s "-screen 0 1280x800x24" dbus-run-session -- pick/e2e/linux.sh [playwright args]
# Automated runs never create Remote Control sessions.
export BLINKLING_REMOTE="${BLINKLING_REMOTE:-0}"
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/blinkling-pick-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
cd "$(dirname "$0")/../.."
exec ../node_modules/.bin/playwright test -c pick/e2e/playwright.config.mjs "$@"
