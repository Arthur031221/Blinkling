#!/usr/bin/env bash
set -euo pipefail
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/blinkling-session-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
npx playwright test -c desktop/session/e2e/electron.config.mjs
