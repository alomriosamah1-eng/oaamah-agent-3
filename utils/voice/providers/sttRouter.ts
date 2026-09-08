// OSAMAH VOICE STT ROUTER — free-first transcription, keys in-app.
//
// Order (from pure voiceProviderOrder): gateway (free, ffmpeg→FLAC→Google STT)
// for the recorded m4a → Google Speech-to-Text REST directly with a user/cloud
// key. Device audio is recorded as m4a by expo-audio; the gateway converts it,
// so the keyed Google path reads the m4a bytes as base64 (Google auto-detects
// container via AUDIO_ENCODING_UNSPECIFIED — accepted for m4a/AAC).
//
// Splitting this from recognition.ts keeps the Recognizer contract stable:
// finish() still lives there, it just calls this router instead of the gateway
// directly. When everything is down the last provider error propagates so the
// loop surfaces the failure exactly as before.

import { gatewayTranscribe, isVoiceGatewayConfigured } from './gateway';
import { acquireVoiceKey, releaseVoiceKey, getVoiceKeyEntries, voiceProviderOrder } from '@/utils/voice/vkeys';
import { voiceLog } from '../log';

const GOOGLE_STT_BASE = 'https://speech.googleapis.com/v1';

function languageCodeFor(locale: string): string {
  // Google accepts "ar-SY" style codes; keep only region when it's not Arabic.
  if (locale.startsWith('ar')) return 'ar';
  return locale.split('-')[0] || 'en-US';
}

/**
 * Google Speech-to-Text direct (keyed). Returns the transcript, throws on any
 * failure so the caller marks the key unusable and falls through.
 */
async function googleStt(
  uri: string,
  locale: string,
  key: string,
  signal?: AbortSignal,
): Promise<string> {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  const base64 = await file.base64();
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) throw new Error('aborted');
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(`${GOOGLE_STT_BASE}/speech:recognize?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          languageCode: languageCodeFor(locale),
          encoding: 'AUDIO_ENCODING_UNSPECIFIED',
          sampleRateHertz: 44100,
        },
        audio: { content: base64 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`google stt failed (${res.status}): ${body.slice(0, 160)}`);
    }
    const data: any = await res.json().catch(() => ({}));
    const alt = data?.results?.[0]?.alternatives?.[0];
    const text = (alt?.transcript ?? '') as string;
    if (typeof alt !== 'object' || alt === null) throw new Error('google stt no result');
    return text.trim();
  } finally {
    controller.abort();
  }
}

/**
 * Transcribe a recorded audio file through the router. Tries, in order:
 *   gateway (free) → google-stt (key).
 * Throws when every provider fails so the caller reports it like before.
 */
export async function sttRouter(
  uri: string,
  locale: string,
  signal?: AbortSignal,
): Promise<string> {
  const gatewayAvailable = isVoiceGatewayConfigured();
  const keys = await getVoiceKeyEntries('stt');
  const order = voiceProviderOrder('stt', gatewayAvailable, keys.length);
  const usedKeys = new Map<string, boolean>();

  const releaseAll = () => {
    for (const [key, ok] of usedKeys) {
      void releaseVoiceKey('stt', key, ok);
    }
  };

  let lastErr: unknown = new Error('no stt provider available');

  try {
    for (const provider of order) {
      try {
        if (provider === 'gateway') {
          voiceLog('VOICE_PROVIDER_SELECTED', 'stt:gateway');
          const text = await gatewayTranscribe(uri, locale);
          return text;
        }
        if (provider === 'google-stt') {
          const picked = await acquireVoiceKey('stt');
          if (!picked) continue;
          usedKeys.set(picked.value, false);
          voiceLog('VOICE_PROVIDER_SELECTED', 'stt:google');
          const text = await googleStt(uri, locale, picked.value, signal);
          usedKeys.set(picked.value, true);
          return text;
        }
      } catch (err) {
        lastErr = err;
        voiceLog('VOICE_PROVIDER_FAILED', `stt:${provider} - ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    releaseAll();
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}