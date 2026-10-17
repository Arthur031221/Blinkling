#!/usr/bin/env bash
# Records one README GIF from the real Blinkling app on a real (virtual) desktop.
# Usage: assets/record/record.sh pick|ask|area|papers|arabic|hard OUT_DIR
# Needs Xvfb, xfwm4, dbus-run-session, ffmpeg, Python 3 and the signed-in Claude Code.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export OUT_DIR="${2:?output directory}" SCENE="${1:?pick, ask, area, papers, arabic or hard}"
mkdir -p "$OUT_DIR"
scale="${REC_SCALE:-1}"
exec xvfb-run -a -s "-screen 0 $((1280 * scale))x$((800 * scale))x24 +extension Composite" \
  dbus-run-session -- bash -c '
    xfwm4 --compositor=on >"$OUT_DIR/wm.log" 2>&1 &
    wm=$!
    trap "kill $wm 2>/dev/null || true" EXIT
    sleep 2
    node "'"$here"'/record.mjs"
  '
