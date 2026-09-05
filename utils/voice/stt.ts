// STT abstraction. Two providers:
//  - `deviceSttProvider`: the on-device recognizer (@react-native-voice) used in
//    development/preview builds — no audio leaves the device. NOT available in
//    Expo Go (the native module is not bundled there).
//  - `cloudSttProvider`: records with expo-audio (bundled in Expo Go) and sends
//    the file to the voice gateway for transcription — the Expo-Go-safe path.
// The engine itself is provider-agnostic, so a future pure on-device model can
// slot in without touching anything else.

import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import { gatewayTranscribe } from './providers/gateway';

export interface SttSessionCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onVolume: (level01: number) => void;
  onError: (err: Error) => void;
}

export interface SttProvider {
  readonly id: string;
  /** Begin recognition. Resolves once the recognizer is listening. */
  start(locale: string, callbacks: SttSessionCallbacks): Promise<void>;
  /** Stop and emit whatever was recognized as a final utterance. */
  stop(): Promise<void>;
  cancel(): Promise<void>;
  isRecognizing(): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/* On-device provider                                                  */
/* ------------------------------------------------------------------ */

let VoiceModule: any = null;
try {
  VoiceModule = require('@react-native-voice/voice').default;
} catch {
  VoiceModule = null;
}

export const deviceSttAvailable: boolean = VoiceModule != null;

export const deviceSttProvider: SttProvider = {
  id: 'device',

  async isRecognizing() {
    if (!VoiceModule) return false;
    try {
      return (await VoiceModule.isRecognizing()) > 0;
    } catch {
      return false;
    }
  },

  start(locale, callbacks) {
    if (!VoiceModule) return Promise.reject(new Error('device speech recognition unavailable'));
    VoiceModule.onSpeechStart = () => {};
    VoiceModule.onSpeechEnd = () => callbacks.onFinal('');
    VoiceModule.onSpeechError = (e: any) => {
      const code = e?.error?.code ?? 'no-speech';
      const localized = (e?.error?.message ?? String(code)) as string;
      callbacks.onError(new Error(Platform.select({ android: localized, default: localized })));
    };
    VoiceModule.onSpeechPartialResults = (e: any) => {
      const text = (Array.isArray(e?.value) ? e.value[0] : '') as string;
      if (text) callbacks.onPartial(text);
    };
    VoiceModule.onSpeechResults = (e: any) => {
      const text = (Array.isArray(e?.value) ? e.value[0] : '') as string;
      if (text) callbacks.onFinal(text);
    };
    VoiceModule.onSpeechVolumeChanged = (e: any) => {
      const value = Number(e?.value);
      // Android reports 0–10, iOS −1…0. Normalize both to 0–1.
      if (Number.isFinite(value)) {
        const level = value > 1 ? value / 10 : value < 0 ? (value + 1) / 4 : value;
        callbacks.onVolume(Math.max(0, Math.min(1, level)));
      }
    };
    return VoiceModule.start(locale);
  },

  stop() {
    return VoiceModule ? VoiceModule.stop() : Promise.resolve();
  },

  cancel() {
    return VoiceModule ? VoiceModule.cancel() : Promise.resolve();
  },
};

/* ------------------------------------------------------------------ */
/* Gateway STT provider (Expo-Go-safe)                                 */
/* Record with expo-audio, upload to the gateway, return the text.     */
/* ------------------------------------------------------------------ */

let AudioRecorderModule: any = null;
try {
  AudioRecorderModule = require('expo-audio');
} catch {
  AudioRecorderModule = null;
}

export const cloudSttAvailable: boolean = AudioRecorderModule != null;

function createCloudSttProvider(): SttProvider {
  let recorder: any = null;
  let locals: null | { locale: string; callbacks: SttSessionCallbacks } = null;

  return {
    id: 'cloud',

    async isRecognizing() {
      return Boolean(recorder?.isRecording);
    },

    async start(locale, callbacks) {
      if (!AudioRecorderModule) {
        callbacks.onError(new Error('audio recording unavailable'));
        return;
      }
      const { setAudioModeAsync, requestRecordingPermissionsAsync, RecordingPresets, AudioModule } = AudioRecorderModule;
      const perm = await requestRecordingPermissionsAsync().catch(() => ({ granted: false } as any));
      if (!perm?.granted) {
        callbacks.onError(new Error('microphone permission denied'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true });
      locals = { locale, callbacks };
      if (typeof AudioModule?.AudioRecorder !== 'function') {
        callbacks.onError(new Error('audio recorder unavailable'));
        return;
      }
      const r = new AudioModule.AudioRecorder();
      recorder = r;
      // Pass the preset to prepareToRecordAsync — expo-audio normalizes it for
      // the current platform (spreads `android`/`ios`/`web`) exactly like its
      // own `useAudioRecorder`. Passing the raw preset to the constructor skips
      // that normalization, so native never sees outputFormat/audioEncoder and
      // record() fails immediately.
      try {
        await r.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      } catch (err) {
        recorder = null;
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      r.record();
    },

    async stop() {
      const session = locals;
      const rec = recorder;
      recorder = null;
      locals = null;
      if (!rec) return;
      let uri: string | null = null;
      try {
        await rec.stop();
        uri = rec.uri as string | null;
      } catch {}
      if (!uri || !session) return;
      try {
        const text = await gatewayTranscribe(uri, session.locale);
        if (text) session.callbacks.onFinal(text);
      } catch (err) {
        session.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    },

    async cancel() {
      const rec = recorder;
      recorder = null;
      locals = null;
      if (rec) {
        await rec.stop().catch(() => {});
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    },
  };
}

export const cloudSttProvider: SttProvider = createCloudSttProvider();