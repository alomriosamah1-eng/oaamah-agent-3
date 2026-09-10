# Embedded OpenCode Runtime Report

## Implemented

The Android application now starts an embedded local HTTP server from `MainApplication` on `127.0.0.1:4096`. The server implements the exact paths consumed by the Osamah client: `/global/health`, `/api/model`, `/global/config`, `/session`, `/session/:id/message`, and `/session/:id/abort`.

The embedded message route sends the request to OpenCode Zen using the official OpenCode session headers (`x-opencode-project`, `x-opencode-session`, `x-opencode-request`, `x-opencode-client`, and the OpenCode User-Agent). No OpenAI/Gemini/Anthropic key was added. The model remains remote through OpenCode Zen; no local model is bundled.

Android voice input is routed to the native Android `SpeechRecognizer` bridge. Android voice output remains the existing native Expo/Android TTS fallback, so Android does not select the external Python gateway. YouTube Reels continue to use the supplied YouTube Data API key.

## Verification

`npm run typecheck` passed. All project test suites passed. The Android arm64 Release build passed with Gradle. The APK is 42 MB, has `minSdkVersion 26`, requests `RECORD_AUDIO`, and passes APK v2 signature verification. The exact OpenCode Zen request shape was tested against the live endpoint with official session headers and returned a real assistant response `OK` with HTTP 200. The official OpenCode server was also separately tested with `/global/health`, session creation, and a real message response.

## Physical-device limitation

No Android device or emulator was attached to this build environment (`adb devices` returned no device). Therefore the native `ServerSocket`, Android SpeechRecognizer permission flow, and Android TTS were compile-verified but not physically exercised on a handset here. The first handset test should verify microphone permission, speech recognition availability, and that the app can reach `https://opencode.ai`.

## Artifact

`osamah-agent-embedded-arm64-v8a.apk` is the arm64 Release artifact. It is intended for the Vortex HD65 Ultra shown by the user and for Android 8+ devices with ARM64 userspace.
