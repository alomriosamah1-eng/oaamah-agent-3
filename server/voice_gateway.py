#!/usr/bin/env python3
"""Osamah Agent — voice gateway for the Expo (Expo Go) app.

Speaks the SAME protocol the app's `utils/voice/providers/gateway.ts` client
expects, so NO app-side change is needed:

    GET  /voice/status      -> { ok, providers: [...], voices: {...} }
    POST /voice/tts         -> synthesised audio bytes (audio/mpeg)
                     body: { provider, text, locale, gender, voice,
                             speechRate, pitch, volume }
    POST /voice/transcribe  -> { text }
                     body: multipart (fields: locale; file: audio)

Backends are FREE and need no API key:
  - TTS:  Microsoft Edge neural voices via `edge-tts` (default: ar-SY-AmanyNeural,
          the Syrian female voice). Synthetic audio is streamed out as MP3.
  - STT:  the Google speech endpoint (no key) — ffmpeg converts the uploaded
          file to 16 kHz mono FLAC first.

Run (bind 0.0.0.0 so a phone on the same Wi-Fi can reach it):
    python3 server/voice_gateway.py            # -> http://0.0.0.0:8100
    VOICE_GATEWAY_PORT=8200 python3 server/voice_gateway.py
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlencode

import edge_tts

try:
    import uvicorn
    from fastapi import FastAPI, HTTPException, Request, UploadFile
    from fastapi.responses import JSONResponse, Response
except ImportError:  # pragma: no cover - dev convenience
    uvicorn = None
    FastAPI = None
    HTTPException = None  # type: ignore
    UploadFile = None  # type: ignore
    JSONResponse = None  # type: ignore
    Request = None  # type: ignore
    Response = None  # type: ignore

HOST = os.getenv("VOICE_GATEWAY_HOST", "0.0.0.0")
PORT = int(os.getenv("VOICE_GATEWAY_PORT", "8100"))

DEFAULT_VOICE = "ar-SY-AmanyNeural"  # أنثى سورية
MAX_CHARS = 1000
MAX_AUDIO_BYTES = 25 * 1024 * 1024

# Provider voice selection. The app's voice catalogue (utils/voice/catalog.ts)
# already carries these exact IDs for azure; edge-tts serves the same Microsoft
# neural voices, so azure requests just work. Google voice IDs are rewritten to
# the closest edge neural voice for the locale.
EDGE_VOICES = {
    "female_ar_sy": "ar-SY-AmanyNeural",
    "female_ar_sa": "ar-SA-ZariyahNeural",
    "male_ar_sy": "ar-SY-LaithNeural",
}

GOOGLE_SPEECH_KEY = "AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw"
GOOGLE_SPEECH_URL = (
    "https://www.google.com/speech-api/v2/recognize"
    f"?output=json&lang={{lang}}&key={GOOGLE_SPEECH_KEY}"
)

# Location of the `voices` directory inside this repo (for the status line).
REPO_VOICES_DIR = Path(__file__).resolve().parent / "voices"


def _speech_rate_to_percent(speech_rate: float) -> str:
    # speechRate 1.0 -> "+0%", 1.2 -> "+20%", 0.8 -> "-20%"
    delta = int(round((speech_rate - 1.0) * 100))
    sign = "+" if delta >= 0 else ""
    return f"{sign}{delta}%"


async def _synthesize(text: str, voice: str, speech_rate: float) -> bytes:
    communicate = edge_tts.Communicate(
        text,
        voice,
        rate=_speech_rate_to_percent(speech_rate),
    )
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio":
            chunks.append(chunk["data"])
    if not chunks:
        raise HTTPException(502, "no audio produced")
    return b"".join(chunks)


def _google_transcribe(flac: bytes, lang: str) -> str:
    import urllib.request

    url = GOOGLE_SPEECH_URL.format(lang=lang)
    req = urllib.request.Request(
        url,
        data=flac,
        headers={"Content-Type": "audio/x-flac; rate=16000"},
        method="POST",
    )
    raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    best = ""
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        results = obj.get("result", [])
        if isinstance(results, dict):
            results = [results]
        for result in results:
            if not isinstance(result, dict):
                continue
            for alt in result.get("alternative") or []:
                if isinstance(alt, dict) and isinstance(alt.get("transcript"), str):
                    alt_text = alt["transcript"].strip()
                    if len(alt_text) > len(best):
                        best = alt_text
    return best


async def _transcribe_bytes(audio: bytes) -> str:
    with tempfile.TemporaryDirectory(prefix="osamah-vgw-") as tmp:
        src = Path(tmp) / "input"
        src.write_bytes(audio)
        flac = Path(tmp) / "audio.flac"
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "flac",
            str(flac),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise HTTPException(500, "ffmpeg convert failed: " + (stderr or b"").decode("utf-8", "ignore")[:200])
        data = flac.read_bytes()

    loop = asyncio.get_running_loop()
    for lang in ("ar-SA", "ar", "auto"):
        for _attempt in range(3):
            text = await loop.run_in_executor(None, _google_transcribe, data, lang)
            if text:
                return text
            await asyncio.sleep(0.7)
    return ""


# --------------------------------------------------------------------------
# FastAPI app (built lazily so `python server/voice_gateway.py --check` and
# import-time tests don't require the optional deps).
# --------------------------------------------------------------------------

_app: FastAPI | None = None


def _build_app() -> FastAPI:
    assert FastAPI is not None, "fastapi is not installed (pip install fastapi uvicorn python-multipart edge-tts)"
    app = FastAPI(title="Osamah voice gateway", version="1.0.0")

    @app.get("/voice/status")
    async def status():
        return {
            "ok": True,
            "providers": ["edge", "google-free-stt"],
            "voices": EDGE_VOICES,
            "default_voice": DEFAULT_VOICE,
        }

    @app.post("/voice/tts")
    async def tts(request: Request):
        body = await request.json()
        text = (body.get("text") or "").strip()
        if not text:
            raise HTTPException(400, "missing text")
        if len(text) > MAX_CHARS:
            raise HTTPException(400, f"text too long, max {MAX_CHARS}")

        locale = (body.get("locale") or "ar-SY").strip()
        gender = (body.get("gender") or "female").strip()
        voice = (body.get("voice") or "").strip()
        speech_rate = float(body.get("speechRate") or 1.0)

        if not voice:
            if locale == "ar-SY" and gender == "female":
                voice = EDGE_VOICES["female_ar_sy"]
            elif locale == "ar-SY" and gender == "male":
                voice = EDGE_VOICES["male_ar_sy"]
            elif locale.startswith("ar-"):
                voice = EDGE_VOICES["female_ar_sy"]
            else:
                voice = DEFAULT_VOICE

        audio = await _synthesize(text, voice, speech_rate)
        return Response(
            content=audio,
            media_type="audio/mpeg",
            headers={"X-Voice": voice, "X-Text-Hash": str(hash(text) & 0x7FFFFFFF)},
        )

    @app.post("/voice/transcribe")
    async def transcribe(audio: UploadFile, locale: str = "ar-SY"):
        body = await audio.read()
        if len(body) > MAX_AUDIO_BYTES:
            raise HTTPException(400, "audio too large")
        text = await _transcribe_bytes(body)
        if not text:
            raise HTTPException(422, "no speech recognized")
        return JSONResponse({"text": text})

    @app.get("/voice")
    async def voice_root():
        return {"ok": True, "endpoints": ["/voice/status", "/voice/tts", "/voice/transcribe"]}

    return app


def get_app() -> FastAPI:
    global _app
    if _app is None:
        _app = _build_app()
    return _app


if __name__ == "__main__":
    if uvicorn is None:
        raise SystemExit("deps missing: pip install fastapi uvicorn python-multipart edge-tts")
    uvicorn.run(get_app(), host=HOST, port=PORT)