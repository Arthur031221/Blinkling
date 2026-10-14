#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
# Invoke under Xvfb and dbus-run-session. Never test alpha without a compositor.
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/blinkling-shell-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
npx playwright test -c desktop/e2e/playwright.config.mjs
npx playwright test -c desktop/main/e2e/playwright.config.mjs
