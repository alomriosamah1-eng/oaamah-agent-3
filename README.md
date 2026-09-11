# OSAMAH AGENT

A production-ready mobile AI agent built with **Expo (React Native) SDK 54**. Speech-first, dark-themed, powered by a free/open voice gateway and the OpenCode Zen model chain — **no API keys required to run**.

Everything you need to run it on any other machine is in this repository: the app, the voice gateway server, and the setup scripts.

---

## Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│   Expo Go (this app)       │        │   Voice gateway (Python)     │
│   ───────────────────────  │        │   ───────────────────────    │
│   Chat  → OpenCode Zen hub │  HTTPS │   edge-tts  (TTS, no key)    │
│            (opencode.ai)   │        │   Google STT (no key)        │
│   Speech → your gateway    │ ◄────► │   server/voice_gateway.py    │
│            (.env URL)      │  HTTP  │  0.0.0.0:8100                │
└────────────────────────────┘        └──────────────────────────────┘
```

- **Chat/LLM**: the app streams from the **OpenCode Zen gateway** (`https://opencode.ai/zen/v1`) over the internet with free models and automatic failover. It works anywhere there is internet — no server needed.
- **Voice (TTS/STT)**: the app talks to the bundled **voice gateway** (`server/voice_gateway.py`) — free Microsoft Edge neural voices (TTS) and Google speech (STT), no keys. The phone records audio with `expo-audio` and sends it to the gateway for transcription (the Expo-Go-safe path).

---

## Architecture note (verified 2026-09-11)

The app's chat engine is the **OpenCode Zen gateway** (`https://opencode.ai/zen/v1`),
reached through a small on-device HTTP transport (`native/android/com/osa/mah/agent/EmbeddedOpenCodeServer.kt`)
on `127.0.0.1:4096`. That transport *proxies* the Zen API (live model catalog +
streamed chat) and is **not** a bundled model or the opencode binary (no Android
build of the opencode binary exists). When a real `opencode serve` runs on the
same LAN it is preferred automatically (`opencode.local` / `EXPO_PUBLIC_OPENCODE_URL`).

Voice input on Android uses the native speech recognizer; voice output uses the
native speech fallback; the Python gateway (`server/voice_gateway.py`, port 8100)
serves Expo Go / LAN development. CI builds per-ABI release APKs via
`.github/workflows/android-release.yml`.

## Repository layout

```
├── app/                      # Expo Router screens (home, chat, tools, settings)
├── components/               # Brand header, orb, ticker, chat input, tools…
├── theme/                    # Dark design system, glass components, colors
├── i18n/                     # Arabic + English strings
├── utils/
│   ├── voice/                # Voice engine, provider router, STT/TTS, catalog
│   ├── OpenCodeAgent.ts      # Zen model chain + streaming chat client
│   ├── hijri.ts              # Tabular Hijri calendar conversion
│   ├── savedFiles.ts         # PDF / generated-file registry (AsyncStorage)
│   └── Database.ts           # SQLite messages + images
├── server/
│   ├── voice_gateway.py      # FastAPI voice gateway (TTS + STT)
│   └── run.sh                # One-command server launcher
├── assets/  constants/  scripts/  tests/
├── app.json                  # Expo config (bundle ids, permissions)
└── package.json
```

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 20+ | Run Expo/Metro |
| Python | 3.10+ | Run the voice gateway |
| ffmpeg | recent | Gateway STT audio conversion |
| Expo Go | from Play Store | Instant runtime on the phone — no native build |

Install `ffmpeg`:

```bash
# Debian/Ubuntu
sudo apt install ffmpeg
# macOS
brew install ffmpeg
```

---

## Quick start (on any machine)

### 1. Install app dependencies

```bash
npm install
```

### 2. Install + start the voice gateway

```bash
pip install -r server/requirements.txt
./server/run.sh
```

The launcher prints the LAN URL your phone can use — e.g. `http://192.168.0.232:8100`.

### 3. Point the app at the gateway

From the project root:

```bash
cp .env.example .env
```

Then edit `.env` and set `EXPO_PUBLIC_VOICE_GATEWAY_URL`:

- **Phone on the same Wi-Fi** → use the LAN URL printed by the server, e.g.
  `EXPO_PUBLIC_VOICE_GATEWAY_URL=http://192.168.0.232:8100`
- **Phone on a different network** → expose the server publicly once:
  ```bash
  ssh -R 80:localhost:8100 nokey@loca.lt     # prints a https://….loca.lt URL
  ```
  and use that URL in `.env`.

### 4. Run the app

```bash
npm start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS). The app connects automatically on load.

---

## Configuration reference

| Setting | Source | Notes |
|---|---|---|
| `EXPO_PUBLIC_VOICE_GATEWAY_URL` | `.env` (recommended) | Endpoint of the voice gateway; overrides `app.json` |
| `extra.voiceGatewayUrl` | `app.json` | Fallback baked into the bundle |
| `extra.zenApiKey` | `app.json` | *Optional* OpenCode Zen key — models work without it (free tier) |
| Voice gender / language / rate | In-app settings → Chat | Saved on-device |

---

## npm scripts

| Command | Purpose |
|---|---|
| `npm start` | Start Expo/Metro, scan with Expo Go |
| `npm run android` / `ios` | Native development build (`expo run:*`) |
| `npm run web` | Run in a browser |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run server` / `server:local` | *(legacy)* Run the opencode CLI server for the LAN chat path |

---

## Voice behaviour

- **TTS providers**: `azure` (via gateway / edge-tts) → `google` (via gateway) → `android` native device TTS. The device TTS is always the last fallback, so replies still play without a server.
- **STT**: Expo Go uses the gateway (`expo-audio` record → `/voice/transcribe`). Development/native builds can use the on-device recognizer instead.
- No cloud provider secrets exist in the app; the gateway is the only component that talks to external speech services.

### Gateway endpoints

| Endpoint | Body | Returns |
|---|---|---|
| `GET /voice/status` | — | `{ ok, providers, voices }` |
| `POST /voice/tts` | `{ provider, text, locale, gender, voice, speechRate, pitch, volume }` | MP3 audio bytes |
| `POST /voice/transcribe` | multipart (`locale`, `audio` file) | `{ text }` |

---

## Troubleshooting

- **Voice doesn't connect** — confirm `EXPO_PUBLIC_VOICE_GATEWAY_URL` is set, the server shows `ok` at `http://<ip>:8100/voice/status`, and the firewall allows port 8100.
- **Expo Go microphone prompt missing** — grant microphone permission in the OS settings after the first prompt.
- **"Could not find an opencode server"** — legacy; current builds chat via the Zen hub and don't need a LAN server.
- **Expo Go reloads** — env changes apply on reload (no rebuild).

---

## License

See [LICENSE](LICENSE).