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
# So a bilingual reply never swaps person mid-sentence, non-Arabic speech
# falls back to the SAME gender's English voice rather than a fixed default.
EDGE_VOICES = {
    "female_ar_sy": "ar-SY-AmanyNeural",
    "male_ar_sy": "ar-SY-LaithNeural",
    "female_ar_sa": "ar-SA-ZariyahNeural",
    "male_ar_sa": "ar-SA-HamedNeural",
    "female_en": "en-US-AriaNeural",
    "male_en": "en-US-GuyNeural",
}

GOOGLE_SPEECH_KEY = os.getenv("GOOGLE_SPEECH_KEY", "").strip()
GOOGLE_SPEECH_URL = (
    "https://www.google.com/speech-api/v2/recognize"
    f"?output=json&lang={{lang}}{('&key=' + GOOGLE_SPEECH_KEY) if GOOGLE_SPEECH_KEY else ''}"
)

# Location of the `voices` directory inside this repo (for the status line).
REPO_VOICES_DIR = Path(__file__).resolve().parent / "voices"

# ---------------------------------------------------------------------------
# Arabic pronunciation (tashkeel)
# ---------------------------------------------------------------------------
# Vowel-less Arabic is ambiguous — the same spelling reads several ways
# ("العلم" = 'ilm / 'alam). Diacritizing the text before synthesis pins the
# vowels so words come out from their correct makhraj. This is done by Mishkal
# (linuxscout/mishkal), a RULE-BASED vocalizer backed by Arabic morphological
# dictionaries — pure Python, no ML models, ~15MB of dictionaries.
# It is OPTIONAL: if mishkal is missing (or OSAMAH_TASHKEEL=0) the gateway
# speaks the raw text exactly as before.
HAS_TASHKEEL = True
_mishkal = None
if os.environ.get("OSAMAH_TASHKEEL", "1").lower() in ("0", "no", "off", "false"):
    HAS_TASHKEEL = False
else:
    try:
        from mishkal.tashkeel import TashkeelClass

        _mishkal = TashkeelClass()
        print("[voice_gateway] mishkal tashkeel loaded — Arabic speech will be diacritized")
    except Exception:  # pragma: no cover — optional dependency degrades gracefully
        _mishkal = None
        HAS_TASHKEEL = False

# Tanween is the least reliable case-ending and the least needed for speech —
# drop it so a wrong tanween can never garble a word's sound.
_TANWEEN = str.maketrans("", "", "\u064B\u064C\u064D")


def _has_arabic(text: str) -> bool:
    return any("\u0600" <= ch <= "\u06FF" for ch in text)


def _diacritize(text: str) -> str:
    """Best-effort Arabic diacritization — never raises, never breaks speech."""
    if not HAS_TASHKEEL or not text or not _has_arabic(text):
        return text
    try:
        out = _mishkal.tashkeel(text, format_display="text") or text
        if not _has_arabic(out):
            return text
        out = out.translate(_TANWEEN).replace("\u0640", "").strip()
        return out or text
    except Exception:  # pragma: no cover — keep speaking no matter what
        return text


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


def _stt_languages(locale_hint: str) -> list[str]:
    """Smallest language chain that still transcribes reliably. The caller
    sends its active locale, so Arabic speech tries only Arabic reads and
    English tries only English — no wasted armed attempts across 4 languages.
    Each language is attempted at most twice with a short pause, so a failed
    first pass cannot add seconds to the user's "understand what was said"
    delay (the voice conversation's reply clock starts the moment the user
    finishes speaking)."""
    hint = (locale_hint or "").lower()
    if hint.startswith("en"):
        return ["en-US"]
    if hint.startswith("ar"):
        # Yemeni MSA reads best, then MSA, then the generic Arabic tag.
        return ["ar-YE", "ar-SA", "ar"]
    return ["ar-YE", "ar-SA", "ar", "en-US"]


async def _transcribe_bytes(audio: bytes, locale_hint: str) -> str:
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
    # Same chain as the desktop assistant (Arabic first, English last), scoped
    # to the recorder's locale and capped at 2 fast attempts per language so a
    # dead first call never stalls the reply.
    for lang in _stt_languages(locale_hint):
        for _attempt in range(2):
            text = await loop.run_in_executor(None, _google_transcribe, data, lang)
            if text:
                return text
            await asyncio.sleep(0.35)
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
            gender_norm = "female" if gender not in ("male", "female") else gender
            if locale == "ar-SA":
                voice = EDGE_VOICES[f"{gender_norm}_ar_sa"]
            elif locale.startswith("ar-"):
                voice = EDGE_VOICES[f"{gender_norm}_ar_sy"]
            elif locale.startswith("en-"):
                voice = EDGE_VOICES[f"{gender_norm}_en"]
            else:
                voice = DEFAULT_VOICE

        audio = await _synthesize(_diacritize(text), voice, speech_rate)
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
        text = await _transcribe_bytes(body, locale)
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
