#!/usr/bin/env bash
set -euo pipefail
# Invoke under xvfb-run and dbus-run-session. Compositor failure must fail tests.
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/glimpselet-desktop-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
npm run desktop:e2e
