#!/usr/bin/env bash
# Cuts the waiting out of one 2x recording and writes every format a demo ships in.
# Usage: assets/record/media.sh IN.mkv NAME "START-END[,START-END...]" [POSTER_SECOND]
#   assets/NAME.webp        README, 1280 px wide, 30 fps, animated WebP
#   assets/site/NAME.mp4    site, 1920 px wide, H.264
#   assets/site/NAME.webm   site, 1920 px wide, VP9
#   assets/site/NAME.png    site poster, 1920 px wide, a frame of the cut
# Segments are seconds of the video. Only whole stretches are dropped, so the
# frames that stay are the recorded frames and the replies are unchanged.
set -euo pipefail
in="${1:?recording}" name="${2:?name}" segments="${3:?segments}" poster="${4:-0}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$root/assets/site"
select=""
IFS=',' read -ra parts <<<"$segments"
for part in "${parts[@]}"; do
  select+="${select:+ + }between(t,${part%-*},${part#*-})"
done
cut="select='$select',setpts=N/FRAME_RATE/TB,fps=30"
ffmpeg -loglevel error -y -i "$in" -vf "$cut,scale=1280:-1:flags=lanczos" \
  -c:v libwebp_anim -quality 90 -compression_level 6 -loop 0 "$root/assets/$name.webp"
ffmpeg -loglevel error -y -i "$in" -vf "$cut,scale=1920:-1:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 -r 30 -movflags +faststart -an "$root/assets/site/$name.mp4"
ffmpeg -loglevel error -y -i "$in" -vf "$cut,scale=1920:-1:flags=lanczos" \
  -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -r 30 -an "$root/assets/site/$name.webm"
ffmpeg -loglevel error -y -i "$root/assets/site/$name.mp4" -ss "$poster" -frames:v 1 "$root/assets/site/$name.png"
