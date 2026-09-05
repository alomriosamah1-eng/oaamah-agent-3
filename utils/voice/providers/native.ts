// Final-tier fallback — the platform's built-in TTS (expo-speech). This is the
// only provider that always works: it needs no gateway, no network, and no
// download. Because it can't take an audio URI, it exposes a `speak` closure
// the engine resolves like a completed playback.

import * as Speech from 'expo-speech';
import { VoiceProvider, TtsRequest, TtsResult, ProviderCapabilities } from './types';
import { voiceLog } from '../log';

const capabilities: ProviderCapabilities = { offline: true, streaming: true };

export const androidNativeProvider: VoiceProvider = {
  id: 'android',
  capabilities,

  async isAvailable() {
    return true;
  },

  async getSupportedLocales() {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const langs = new Set<string>();
      for (const v of voices) {
        if (v?.language) langs.add(v.language);
        if (v?.identifier?.includes('-')) langs.add(v.identifier);
      }
      return [...langs];
    } catch {
      return [];
    }
  },

  synthesize(request: TtsRequest) {
    // Trim to a size the platform speech can swallow in one call.
    const text = request.text.trim();
    voiceLog('VOICE_STREAM_STARTED', `android-speaking ${text.length} chars`);
    const speak = () =>
      new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          voiceLog('VOICE_STREAM_COMPLETED', 'android-speech-done');
          resolve();
        };
        const stopAll = () => {
          Speech.stop();
          finish();
        };
        Speech.speak(text, {
          language: request.locale || 'ar-SA',
          pitch: request.pitch,
          rate: request.speechRate,
          onDone: finish,
          onStopped: finish,
          onError: () => finish(),
        });
        if (request.signal) {
          if (request.signal.aborted) {
            stopAll();
            return;
          }
          request.signal.addEventListener('abort', stopAll, { once: true });
        }
      });
    return Promise.resolve({ provider: 'android', kind: 'voice', speak } satisfies TtsResult);
  },

  cancel() {
    Speech.stop();
  },
};