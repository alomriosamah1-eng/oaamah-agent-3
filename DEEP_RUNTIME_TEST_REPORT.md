# Deep Runtime Test Report

## Tests that passed

The project TypeScript typecheck and all existing test suites passed. The Android release build passed for arm64. The APK metadata confirms Android API 26 minimum, API 35 target, INTERNET permission, RECORD_AUDIO permission, and arm64 native libraries.

The exact OpenCode Zen request protocol used by the embedded server was tested with the official session headers. `big-pickle` returned a real response, and `ling-3.0-flash-fin-free` also returned a real response. The YouTube Data API key returned a valid search response containing one item. The official OpenCode server separately returned health, model/session, and real message results.

## What cannot be honestly claimed in this environment

There is no attached Android handset and the Android emulator cannot boot because the environment lacks `/dev/kvm`; software-only emulation is not usable here. Therefore no test in this environment can prove that a particular physical phone successfully starts the Android `ServerSocket`, grants microphone permission, or renders the model list. Compile success is not a substitute for that test.

## Current most likely device-side failure point

The previous APK could select a stale stored network/tunnel endpoint before localhost. The source has been corrected so `http://127.0.0.1:4096` is the first candidate, and the root React layout explicitly calls the native server start method. This corrected source was compiled successfully, but the actual phone behavior still requires a handset-side log or test.
