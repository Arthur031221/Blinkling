#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
# Invoke under xvfb-run and dbus-run-session; alpha needs a compositor.
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/blinkling-guides-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
npx playwright test -c desktop/guides/e2e/playwright.config.mjs "$@"
