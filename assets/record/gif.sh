#!/usr/bin/env bash
# Cuts the waiting out of one recording and writes a looping GIF.
# Usage: assets/record/gif.sh IN.mkv OUT.gif "START-END[,START-END...]" [WIDTH] [FPS]
# Segments are seconds of the video. Only whole stretches are dropped, so the
# frames that stay are the recorded frames and the replies are unchanged.
set -euo pipefail
in="${1:?recording}" out="${2:?gif}" segments="${3:?segments}" width="${4:-480}" fps="${5:-12}"
select=""
IFS=',' read -ra parts <<<"$segments"
for part in "${parts[@]}"; do
  select+="${select:+ + }between(t,${part%-*},${part#*-})"
done
ffmpeg -loglevel error -y -i "$in" -vf \
  "select='$select',setpts=N/FRAME_RATE/TB,fps=$fps,scale=$width:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 "$out"
