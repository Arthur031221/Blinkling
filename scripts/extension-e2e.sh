#!/usr/bin/env bash
set -euo pipefail

# Native fullscreen and always-on-top tests need a real window manager. Each
# run owns its X display and session bus, including when another run is active.
if [[ ${BLINKLING_TEST_DESKTOP:-} != 1 ]]; then
  exec xvfb-run -a dbus-run-session -- env BLINKLING_TEST_DESKTOP=1 bash "$0" "$@"
fi
xfwm4 --compositor=off > /tmp/blinkling-test-wm-"${DISPLAY//:/}".log 2>&1 &
manager_pid=$!
test_runtime=$(mktemp -d)
export BLINKLING_RUNTIME_DIR="$test_runtime"
trap 'kill "$manager_pid" 2>/dev/null || true; rm -rf "$test_runtime"' EXIT
for ((attempt=0; attempt<100; attempt++)); do
  if [[ $(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null) == *"window id"* ]]; then
    npx playwright test --config playwright.extension.config.ts "$@"
    exit $?
  fi
  sleep 0.1
done
echo "The test window manager did not start" >&2
exit 1
