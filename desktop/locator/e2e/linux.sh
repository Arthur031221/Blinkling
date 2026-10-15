#!/usr/bin/env bash
set -euo pipefail
# Run as: xvfb-run -a -s "-screen 0 1280x800x24" dbus-run-session -- locator/e2e/linux.sh [playwright args]
# Automated runs never create Remote Control sessions.
export BLINKLING_REMOTE="${BLINKLING_REMOTE:-0}"
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/blinkling-locator-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
# A desktop with a screen reader or the accessibility switch on: without it Chrome
# does not publish its tree on the AT-SPI bus and the OS source has nothing to read.
dbus-send --session --print-reply --dest=org.a11y.Bus /org/a11y/bus \
  org.freedesktop.DBus.Properties.Set string:org.a11y.Status string:IsEnabled \
  variant:boolean:true > /dev/null
cd "$(dirname "$0")/../.."
exec ../node_modules/.bin/playwright test -c locator/e2e/playwright.config.mjs "$@"
