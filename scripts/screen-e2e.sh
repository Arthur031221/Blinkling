#!/usr/bin/env bash
set -euo pipefail

# Automated runs never create Remote Control sessions in a real account.
export BLINKLING_REMOTE=${BLINKLING_REMOTE:-0}

# Native fullscreen crop needs a real window manager. Each run owns its
# display and session bus, including when another Node matrix run is active.
if [[ ${BLINKLING_TEST_DESKTOP:-} != 1 ]]; then
  exec xvfb-run -a dbus-run-session -- env BLINKLING_TEST_DESKTOP=1 bash "$0" "$@"
fi
xfwm4 --compositor=off > /tmp/blinkling-screen-test-wm-"${DISPLAY//:/}".log 2>&1 &
manager_pid=$!
trap 'kill "$manager_pid" 2>/dev/null || true' EXIT
for ((attempt=0; attempt<100; attempt++)); do
  if [[ $(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null) == *"window id"* ]]; then
    node scripts/screen-e2e.mjs "$@"
    exit $?
  fi
  sleep 0.1
done
echo "The screen test window manager did not start" >&2
exit 1
