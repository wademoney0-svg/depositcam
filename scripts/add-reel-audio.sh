#!/usr/bin/env bash
# Mux royalty-free music under the DepositCam reel.
# Usage:
#   bash scripts/add-reel-audio.sh path/to/your-track.mp3
#
# Get a free ~30s upbeat track from Pixabay (no account needed):
#   https://pixabay.com/music/search/upbeat%20short/
# Save it as shots/reel/music.mp3 and run this script.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REEL="$ROOT/shots/reel/depositcam-reel.mp4"
OUT="$ROOT/shots/reel/depositcam-reel-audio.mp4"
MUSIC="${1:-$ROOT/shots/reel/music.mp3}"

if [[ ! -f "$REEL" ]]; then
  echo "Missing reel: $REEL" >&2
  exit 1
fi

if [[ ! -f "$MUSIC" ]]; then
  cat >&2 <<EOF
No music file found.

1. Download a royalty-free track (~30s, upbeat) from Pixabay:
   https://pixabay.com/music/search/upbeat%20short/

2. Save it as:
   $ROOT/shots/reel/music.mp3

3. Re-run:
   bash scripts/add-reel-audio.sh

Or pass any MP3 path:
   bash scripts/add-reel-audio.sh ~/Downloads/my-track.mp3

For TikTok / Instagram Reels: upload the SILENT reel (depositcam-reel.mp4)
and add a trending sound inside the app — better reach + no copyright issues.
EOF
  exit 1
fi

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$REEL")

ffmpeg -y -hide_banner -loglevel error \
  -i "$REEL" -i "$MUSIC" \
  -filter_complex "[1:a]atrim=0:${DUR},asetpts=PTS-STARTPTS,volume=0.45[a]" \
  -map 0:v:0 -map "[a]" \
  -c:v copy -c:a aac -b:a 192k -shortest \
  -movflags +faststart \
  "$OUT"

echo "reel with audio: $OUT"
