#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
if [[ "${BLINKLING_ACCEPTANCE_DISPLAY:-}" != 1 ]]; then
  exec xvfb-run -a -s '-screen 0 1280x800x24 +extension Composite' \
    dbus-run-session -- env BLINKLING_ACCEPTANCE_DISPLAY=1 \
    bash desktop/main/acceptance/linux.sh "$@"
fi
xfwm4 --compositor=on > "${TMPDIR:-/tmp}/blinkling-shell-wm-${DISPLAY//:/}.log" 2>&1 &
wm=$!
trap 'kill "$wm" 2>/dev/null || true; wait "$wm" 2>/dev/null || true' EXIT
sleep 2
kill -0 "$wm"
npx playwright test -c desktop/main/acceptance/playwright.config.mjs "$@"
