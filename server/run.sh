#!/usr/bin/env bash
# Start the Osamah voice gateway (edge-tts TTS + Google-free STT).
# Hosts on 0.0.0.0:8100 by default so an Expo Go phone on the same Wi-Fi
# can reach it at http://<this-machine-lan-ip>:8100
#
# Usage:
#   ./server/run.sh                 # python3 on PATH
#   VOICE_GATEWAY_PORT=8200 ./server/run.sh
#   PY=... ./server/run.sh          # explicit interpreter
set -euo pipefail

# Pick an interpreter that has the deps.
pick_python() {
  for p in "${PY:-}" \
    "$(command -v python3 2>/dev/null || true)" \
    "$(command -v python 2>/dev/null || true)"; do
    [ -n "$p" ] || continue
    if "$p" -c 'import edge_tts, fastapi, uvicorn, multipart' >/dev/null 2>&1; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

PYTHON="$(pick_python)" || {
  echo "missing deps: pip install edge-tts fastapi uvicorn python-multipart" >&2
  exit 1
}

cd "$(dirname "$0")"

# Local-only secrets are loaded from the project root when present. This file
# is ignored by Git and is never bundled into the mobile application.
if [ -f ../.voice.env ]; then
  set -a
  . ../.voice.env
  set +a
fi

echo "Osamah voice gateway starting on 0.0.0.0:${VOICE_GATEWAY_PORT:-8100} ..."
LAN_IP="$(python3 - <<'PY' 2>/dev/null || true
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80))
    print(s.getsockname()[0])
except Exception:
    pass
PY
)"
if [ -n "${LAN_IP:-}" ]; then
  echo "On the SAME Wi-Fi, set in the app root:"
  echo "    echo \"EXPO_PUBLIC_VOICE_GATEWAY_URL=http://${LAN_IP}:${VOICE_GATEWAY_PORT:-8100}\" > .env"
  echo "From ANOTHER network, expose this port publicly (e.g. ssh -R 80:localhost:${VOICE_GATEWAY_PORT:-8100} nokey@loca.lt)."
fi

exec "$PYTHON" voice_gateway.py "$@"
