#!/bin/bash
# Assemble the final narrated demo MP4.
# Pass A: per-clip mix — VP8+opus webm + narration MP3 → H.264+AAC mp4,
#         narration delayed 0.7s so each scene breathes before speech.
# Pass B: concat demuxer, -c copy (all pass-A outputs share codec/params).
set -euo pipefail

FF=$HOME/work/invofi-check/invofi/apps/frontend/node_modules/ffmpeg-static/ffmpeg
CLIPS=/tmp/demo-clips
OUT=$CLIPS/final
mkdir -p "$OUT"
rm -f "$OUT"/mixed-*.mp4 "$OUT/concat.txt"

# Per-scene narration delay (ms). Scene 5/6a start quickly; intro breathes longer.
declare -A DELAY=( [01]=1000 [02]=800 [03]=800 [04]=800 [05]=500 [06a]=500 [06b]=500 [07]=600 [08]=700 [09]=700 )

for clip in "$CLIPS"/clip-*.webm; do
  base=$(basename "$clip" .webm)                # clip-01-intro-landing
  key=$(echo "$base" | cut -d- -f2)             # 01 / 06a / ...
  narr="$CLIPS/narration/narr-$key.mp3"
  [ -f "$narr" ] || { echo "MISSING narration for $key"; exit 1; }
  d=${DELAY[$key]}
  echo "== mixing $base (delay ${d}ms)"
  "$FF" -hide_banner -loglevel error -y -i "$clip" -i "$narr" -filter_complex \
    "[1:a]adelay=${d}|${d},apad[a]" \
    -map 0:v -map "[a]" \
    -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 160k -ar 44100 \
    -shortest \
    "$OUT/mixed-$base.mp4"
done

# Pass B: concat (uniform codecs after pass A).
: > "$OUT/concat.txt"
for f in "$OUT"/mixed-clip-*.mp4; do echo "file '$f'" >> "$OUT/concat.txt"; done
"$FF" -hide_banner -loglevel error -y -f concat -safe 0 -i "$OUT/concat.txt" \
  -c copy -movflags +faststart "$CLIPS/invofi-demo-final.mp4"

# Report.
for f in "$OUT"/mixed-clip-*.mp4; do
  dur=$("$FF" -i "$f" 2>&1 | grep -oE 'Duration: [0-9:.]+' | head -1)
  echo "$(basename "$f"): $dur"
done
echo "FINAL: $CLIPS/invofi-demo-final.mp4"
"$FF" -i "$CLIPS/invofi-demo-final.mp4" 2>&1 | grep -E 'Duration|Stream' | head -4
ls -la "$CLIPS/invofi-demo-final.mp4"
