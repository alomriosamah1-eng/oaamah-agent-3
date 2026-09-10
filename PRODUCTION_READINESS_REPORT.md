# Osamah Agent — Production Readiness Report

## Executive assessment

The project was configured and built as a native Expo/React Native Android application with Android API 26 as the minimum supported version. The release build uses Hermes, release code/resource shrinking, and ABI-specific APKs to satisfy the requested 50 MB limit. The OpenCode agent transport, local server discovery, voice gateway configuration, and Android recording permission are included.

## Verified release artifacts

| Artifact | ABI | Size | Minimum API | Target API | Signature |
|---|---:|---:|---:|---:|---|
| `osamah-agent-arm64-v8a.apk` | 64-bit ARM | 42 MB | 26 (Android 8.0) | 35 | APK v2 verified |
| `osamah-agent-armeabi-v7a.apk` | 32-bit ARM | 35 MB | 26 (Android 8.0) | 35 | APK v2 verified |

The universal APK was also built successfully, but it was 121 MB because it contained four native ABIs. It is not used for the 50 MB delivery target.

## Implemented changes

The Expo Android configuration now explicitly sets `minSdkVersion` to 26, `compileSdkVersion` and `targetSdkVersion` to 35, enables release minification and resource shrinking, permits cleartext traffic for explicitly configured local HTTP servers, and retains the microphone permission. The production Expo configuration exposes `EXPO_PUBLIC_OPENCODE_URL` through `extra.opencodeUrl`, allowing release builds to use a real OpenCode endpoint instead of relying only on development-time environment injection.

The app already performs ordered OpenCode discovery using a configured endpoint, a persisted endpoint, the Expo/Metro host, `opencode.local`, localhost, and the Android emulator host `10.0.2.2`. The voice gateway remains available on the LAN at port 8100 by default and exposes `/voice/status`, `/voice/tts`, and `/voice/transcribe`.

## Test evidence

`npm ci` completed successfully. `npm run typecheck` passed. `npm test` passed. `npx expo export --platform android` passed and produced an Android Hermes bundle of approximately 5.96 MB. The native release build completed successfully after installing the Android SDK/NDK and full JDK. Both ABI-specific APKs were checked with `aapt` and `apksigner`; each reports package `com.osa.mah.agent`, `sdkVersion '26'`, target SDK 35, the recording permission, and a valid APK v2 signature. The voice gateway was started with the project virtual environment and its `/voice/status` endpoint returned HTTP 200.

## Runtime configuration

Before installing for a physical phone, set real reachable endpoints in a `.env` file based on `.env.production.example`:

```bash
EXPO_PUBLIC_OPENCODE_URL=http://<computer-lan-ip>:4096
EXPO_PUBLIC_VOICE_GATEWAY_URL=http://<computer-lan-ip>:8100
```

For internet-facing deployments, use authenticated HTTPS endpoints. The local HTTP allowance exists only because the requested workflow includes LAN servers; do not expose the gateway publicly without an authentication or tunnel layer.

## Remaining release checks

A physical Android device was not attached to this environment, so cold-start behavior, microphone permission prompts, background/foreground transitions, process recreation, rotation behavior, and real network calls from a handset were not instrumented here. These should be completed on at least one Android 8/9 device and one recent 64-bit Android device. The 32-bit APK is intended for older ARM devices; the 64-bit APK is the preferred Play-compatible artifact.

No claim of bug-free behavior is made. The measurable release gate achieved in this environment is: native build success, API 26 compatibility metadata, valid APK signatures, ABI-specific sizes below 50 MB, passing TypeScript/tests, successful JS export, and a live local voice status response.
