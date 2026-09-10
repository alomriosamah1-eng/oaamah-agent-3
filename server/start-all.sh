#!/usr/bin/env bash
set -euo pipefail

# Install OpenCode from the official installer only when it is missing.
if ! command -v opencode >/dev/null 2>&1; then
  echo 'OpenCode is not installed. Install it from the official source:' >&2
  echo '  curl -fsSL https://opencode.ai/install | bash' >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -x "$(command -v ffmpeg || true)" ]; then
  echo 'ffmpeg is required for voice transcription.' >&2
  exit 1
fi

if ! "$ROOT/.venv/bin/python" -c 'import edge_tts, fastapi, uvicorn, multipart' >/dev/null 2>&1; then
  echo 'Voice dependencies are missing. Run: python3 -m venv .venv && .venv/bin/pip install -r server/requirements.txt' >&2
  exit 1
fi

cleanup() {
  kill "${VOICE_PID:-}" "${OPEN_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

VOICE_GATEWAY_HOST=0.0.0.0 VOICE_GATEWAY_PORT="${VOICE_GATEWAY_PORT:-8100}" \
  "$ROOT/.venv/bin/python" server/voice_gateway.py &
VOICE_PID=$!

OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-}" \
  opencode serve --hostname 0.0.0.0 --port "${OPENCODE_PORT:-4096}" --mdns &
OPEN_PID=$!

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "Voice gateway: http://${LAN_IP:-127.0.0.1}:${VOICE_GATEWAY_PORT:-8100}"
echo "OpenCode server: http://${LAN_IP:-127.0.0.1}:${OPENCODE_PORT:-4096}"
echo "mDNS OpenCode: http://opencode.local:${OPENCODE_PORT:-4096}"
wait -n "$VOICE_PID" "$OPEN_PID"
