// Speech recognition — the desktop assistant's STT method on the phone.
//
// Desktop (floating_assistant.py `_audio_loop` + `_stt_worker`): RMS energy VAD,
// calibration → adaptive noise floor → speech start → silence-to-end, then the
// utterance goes to Google (free speech endpoint) with the Arabic→English
// language chain. Here the mic is recorded with expo-audio (bundled in Expo Go)
// under the same VAD and the recording is transcribed by the voice gateway,
// which runs that exact Google chain (`ar-YE → ar-SA → ar → en-US`).
//
// This module is the ONLY listener. There is no on-device recognizer anymore —
// the desktop never used one, so neither do we.

import { setAudioModeAsync } from 'expo-audio';
import { gatewayTranscribe } from './providers/gateway';

export interface RecognitionCallbacks {
  /** Final transcript; '' means only a noise blip was heard (re-arm). */
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
  /** Live mic level in 0–1 for the orb. */
  onVolume: (level01: number) => void;
}

export interface Recognizer {
  /** Begin a listening session. Resolves once the mic is live. */
  start(locale: string, callbacks: RecognitionCallbacks): Promise<void>;
  /** Stop and ship whatever was heard to the gateway for transcription. */
  stop(): Promise<void>;
  /** Abort without transcribing. */
  cancel(): Promise<void>;
  isRecognizing(): Promise<boolean>;
}

let AudioRecorderModule: any = null;
try {
  AudioRecorderModule = require('expo-audio');
} catch {
  AudioRecorderModule = null;
}

export const recognitionAvailable: boolean = AudioRecorderModule != null;

/** Marker used by the UI to distinguish a permission problem from an I/O one. */
export const MIC_PERMISSION_DENIED = 'microphone permission denied';
export const MIC_PERMISSION_BLOCKED = 'microphone permission permanently denied';

/* ------------------------------------------------------------------ */
/* VAD tuning — the desktop's window sizes, in milliseconds so the     */
/* result is independent of how often the platform pushes status.      */
/* ------------------------------------------------------------------ */

const VAD_POLL_MS = 200;
const VAD_MAX_DURATION_MS = 30_000;
const VAD_MIN_SPEECH_MS = 400;
const VAD_MAX_SILENCE_MS = 1000;
const VAD_CALIBRATE_MS = 1200;

/** dBFS meter in [-160, 0] → linear amplitude (16-bit scale, 0..1-ish). */
function meteringToAmplitude(dB: number | undefined): number {
  if (typeof dB !== 'number' || !Number.isFinite(dB) || dB <= -160) return 0;
  return Math.pow(10, dB / 20);
}

/** Absolute floor (~ -58 dBFS), whisper sensitivity — desktop's min 12.0. */
const VAD_FLOOR_AMPLITUDE = Math.pow(10, -58 / 20);
/** threshold = max(noiseFloor * 2, floor) — the desktop's baseline*2 rule. */
const VAD_THRESHOLD_FACTOR = 2.0;

export async function requestMicPermission(): Promise<boolean> {
  if (!AudioRecorderModule) return false;
  const { requestRecordingPermissionsAsync } = AudioRecorderModule;
  const perm = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }) as any);
  return Boolean(perm?.granted);
}

/**
 * One VAD-governed recording session. `start()` resolves once the mic is
 * listening; the utterance ends itself when the speaker goes silent (the
 * desktop's MAX_SILENCE rule) and is then transcribed and delivered via
 * `onFinal`. An empty final means only background noise was captured and the
 * caller should simply listen again — exactly like the desktop discards blips
 * shorter than MIN_SPEECH.
 */
export function createRecognizer(): Recognizer {
  let recorder: any = null;
  let locals: null | { locale: string; callbacks: RecognitionCallbacks } = null;
  let vadTimer: ReturnType<typeof setInterval> | null = null;

  function teardown() {
    if (vadTimer) {
      clearInterval(vadTimer);
      vadTimer = null;
    }
    const rec = recorder;
    recorder = null;
    locals = null;
    return rec;
  }

  async function finish(
    rec: any,
    session: { locale: string; callbacks: RecognitionCallbacks },
  ) {
    // Capture the path before stopping: some platforms only expose the file
    // then, and a native stop() that throws must not lose the recording.
    let uri: string | null = null;
    try {
      uri = (rec?.uri as string | null) ?? null;
    } catch {}
    try {
      await rec.stop();
    } catch {}
    if (!uri) {
      try {
        uri = (rec?.uri as string | null) ?? null;
      } catch {}
    }
    if (!uri) {
      await AudioRecorderModule.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      session.callbacks.onError(new Error('recording produced no audio file'));
      return;
    }
    try {
      const text = await gatewayTranscribe(uri, session.locale);
      session.callbacks.onFinal(text);
    } catch (err) {
      session.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      await AudioRecorderModule.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  }

  return {
    async isRecognizing() {
      return Boolean(recorder?.isRecording);
    },

    async start(locale, callbacks) {
      try {
        await startInner(locale, callbacks);
      } catch (err) {
        teardown();
        await AudioRecorderModule?.setAudioModeAsync?.({ allowsRecording: false }).catch(() => {});
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
    },

    async stop() {
      const session = locals;
      const rec = teardown();
      if (!rec || !session) return;
      await finish(rec, session);
    },

    async cancel() {
      const rec = teardown();
      if (rec) {
        await rec.stop().catch(() => {});
        await AudioRecorderModule.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    },
  };

  /** The real start. NEVER throws on its own — outer `start` translates any
   *  throw into `onError`, so a stuck "listening" state is impossible. */
  async function startInner(locale: string, callbacks: RecognitionCallbacks) {
    if (!AudioRecorderModule) {
      throw new Error('microphone unavailable');
    }
    // One full retry of the whole sequence: enabling the recording audio mode
    // can contend with an audio session that just released (seen on both
    // platforms), and a fresh clamp is far more reliable than a half-started one.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await oneAttempt(locale, callbacks);
        return;
      } catch (err) {
        recorder = null;
        locals = null;
        await AudioRecorderModule.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        if (attempt === 2) throw err;
        await new Promise((res) => setTimeout(res, 350));
      }
    }
  }

  async function oneAttempt(locale: string, callbacks: RecognitionCallbacks) {
    const { setAudioModeAsync: mode, requestRecordingPermissionsAsync, RecordingPresets, AudioModule } =
      AudioRecorderModule;
    // Ask for the microphone directly. `request()` shows the system dialog the
    // first time and resolves from the cached state afterwards — it returns
    // `canAskAgain: false` once the user has chosen "never ask again", which is
    // the only case the dialog can't re-open (then the UI must go to settings).
    const perm = await requestRecordingPermissionsAsync().catch(() => ({ granted: false } as any));
    if (!perm?.granted) {
      throw new Error(perm?.canAskAgain === false ? MIC_PERMISSION_BLOCKED : MIC_PERMISSION_DENIED);
    }
    if (typeof AudioModule?.AudioRecorder !== 'function') {
      throw new Error('audio recorder unavailable');
    }
    try {
      await mode({ allowsRecording: true });
    } catch (err) {
      throw new Error(`voice mode failed: ${messageOf(err)}`);
    }
    locals = { locale, callbacks };
    let r: any;
    try {
      r = new AudioModule.AudioRecorder();
    } catch (err) {
      throw new Error(`recorder create failed: ${messageOf(err)}`);
    }
    recorder = r;
    const vadRecordingOptions = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
    try {
      await r.prepareToRecordAsync(vadRecordingOptions);
    } catch (err) {
      throw new Error(`recorder prepare failed: ${messageOf(err)}`);
    }
    try {
      r.record();
    } catch (err) {
      throw new Error(`recorder record failed: ${messageOf(err)}`);
    }
    // Verify the native side actually began recording — a platform can swallow
    // `record()` and leave isRecording false (seen on iOS), which would otherwise
    // hang the loop in "calibrating" forever.
    for (let i = 0; i < 20; i++) {
      let ok = false;
      try {
        ok = r.isRecording === true;
      } catch {}
      if (ok) break;
      await new Promise((res) => setTimeout(res, 40));
    }
    if (!(r.isRecording === true)) {
      throw new Error('recorder did not begin (isRecording=false)');
    }
    startVadLoop(r, locals);
  }

  function messageOf(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  /** The desktop's energy loop in miniature (see header comment). */
  function startVadLoop(rec: any, session: { locale: string; callbacks: RecognitionCallbacks }) {
    const { callbacks } = session;
    let noiseFloor = VAD_FLOOR_AMPLITUDE;
    let threshold = VAD_FLOOR_AMPLITUDE;
    let calibratedAt = -1;
    let anchorMs = -1; // calibration window anchor (captured once)
    let calibration: number[] = [];
    let spoke = false;
    let speechStartMs = -1;
    let lastVoiceMs = -1;
    let prevAmp = 0;
    let prevPrevAmp = 0;
    let deadTicks = 0;

    const tick = () => {
      if (recorder !== rec) {
        if (vadTimer) clearInterval(vadTimer);
        vadTimer = null;
        return;
      }
      const status = rec.getStatus?.() as
        | { metering?: number; durationMillis?: number; isRecording?: boolean }
        | undefined;
      const duration = status?.durationMillis ?? 0;
      // Watchdog: some Android builds swallow `record()` and sit in "calibrating"
      // forever with no file ever appearing — treat it as a hard error, not a hang.
      const going = status?.isRecording === true;
      if (!going && duration <= 0) {
        deadTicks += 1;
        if (deadTicks >= 5) {
          teardown();
          callbacks.onError(new Error('microphone did not start'));
          return;
        }
      } else {
        deadTicks = 0;
      }
      if (status && status.isRecording === false && duration > 0) {
        teardown();
        void finish(rec, session);
        return;
      }
      if (duration >= VAD_MAX_DURATION_MS) {
        teardown();
        void finish(rec, session);
        return;
      }

      const amp = meteringToAmplitude(status?.metering);
      const smooth = prevPrevAmp > 0 || prevAmp > 0 ? (prevPrevAmp + prevAmp + amp) / 3 : amp;
      prevPrevAmp = prevAmp;
      prevAmp = amp;

      // Calibration: measure ambient noise, open the gate above it. Re-anchoring
      // the window on every tick would keep it at 0 length and the gate would
      // NEVER open (a real freeze seen on device).
      if (calibratedAt < 0) {
        if (anchorMs < 0) anchorMs = duration;
        calibration.push(amp);
        if (duration - anchorMs >= VAD_CALIBRATE_MS) {
          const sorted = [...calibration].sort((a, b) => a - b);
          const baseline = sorted[Math.floor(sorted.length / 2)] ?? VAD_FLOOR_AMPLITUDE;
          noiseFloor = Math.max(baseline, VAD_FLOOR_AMPLITUDE);
          threshold = Math.max(noiseFloor * VAD_THRESHOLD_FACTOR, VAD_FLOOR_AMPLITUDE);
          calibratedAt = duration;
        }
        callbacks.onVolume(0);
        return;
      }

      const isVoice = amp > threshold;
      callbacks.onVolume(Math.max(0, Math.min(1, amp * 3)));

      if (!spoke) {
        // Adaptive noise floor from quiet frames (desktop formula).
        if (!isVoice) {
          noiseFloor = Math.max(
            VAD_FLOOR_AMPLITUDE,
            Math.min(noiseFloor * 0.8 + amp * 0.2, threshold * 0.7),
          );
          threshold = Math.max(noiseFloor * VAD_THRESHOLD_FACTOR, VAD_FLOOR_AMPLITUDE);
        } else {
          spoke = true;
          speechStartMs = duration;
          lastVoiceMs = duration;
        }
        return;
      }

      if (isVoice) {
        lastVoiceMs = duration;
        return;
      }

      if (duration - lastVoiceMs >= VAD_MAX_SILENCE_MS) {
        const speechMs = duration - speechStartMs;
        teardown();
        if (speechMs < VAD_MIN_SPEECH_MS) {
          // Noise blip, not a word — desktop clears its buffer and keeps
          // listening. An empty final makes the loop re-arm the same way.
          callbacks.onFinal('');
        } else {
          void finish(rec, session);
        }
      }
    };

    vadTimer = setInterval(tick, VAD_POLL_MS);
  }
}

/**
 * One-shot dictation for the chat composer: records under the same VAD and
 * returns the transcript when the user goes silent (or `cancel()` is called).
 */
export function recordOneShot(
  locale: string,
): { result: Promise<string>; cancel: () => void } | null {
  if (!AudioRecorderModule) return null;
  const recog = createRecognizer();
  let settled = false;
  const result = new Promise<string>((resolve, reject) => {
    void recog.start(locale, {
      onFinal: (text) => {
        if (settled) return;
        settled = true;
        resolve(text);
      },
      onError: (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      },
      onVolume: () => {},
    });
  });
  return {
    result,
    cancel: () => {
      if (!settled) {
        settled = true;
        void recog.cancel().catch(() => {});
        result.catch(() => {});
      }
    },
  };
}