// OSAMAH VOICE TTS ROUTER — free-first synthesis, keys in-app.
//
// Order (from pure voiceProviderOrder): gateway edge-tts (free) → Google TTS
// REST with a user/cloud key → VoiceRSS with a key → `null`, letting speech.ts
// fall back to the built-in native TTS. Only providers whose prerequisites
// exist are attempted (gateway needs a reachable URL; keyed ones need a key).
// Returns `{ uri }` on success, throws nothing, and reports via voiceLog so a
// failing provider never breaks the conversation loop.

import { gatewayTts, isVoiceGatewayConfigured, type GatewayTtsPayload } from './gateway';
import { acquireVoiceKey, releaseVoiceKey, getVoiceKeyEntries, voiceProviderOrder } from '@/utils/voice/vkeys';
import { voiceLog } from '../log';

export interface TtsRouterPayload {
  text: string;
  locale: string;
  gender: 'male' | 'female';
  voice: string;
  speechRate: number;
  pitch: number;
  volume: number;
}

const GOOGLE_TTS_BASE = 'https://texttospeech.googleapis.com/v1';
const VOICERSS_BASE = 'https://api.voicerss.org';

/** Build the exact payload the gateway's edge-tts path expects. */
function gatewayPayload(p: TtsRouterPayload): GatewayTtsPayload {
  return {
    provider: 'azure',
    text: p.text,
    locale: p.locale,
    gender: p.gender,
    voice: p.voice,
    speechRate: p.speechRate,
    pitch: p.pitch,
    volume: p.volume,
  };
}

function voiceRssLang(locale: string): string {
  // VoiceRSS uses short language tags; map the app's locales.
  if (locale.startsWith('ar')) return 'ar-sa';
  return 'en-us';
}

/** Google TTS: POST text:synthesize with an API key → audioContent (base64). */
async function googleTts(p: TtsRouterPayload, key: string, signal?: AbortSignal): Promise<{ uri: string }> {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) throw new Error('aborted');
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(`${GOOGLE_TTS_BASE}/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: p.text },
        voice: {
          languageCode: p.locale.startsWith('ar') ? 'ar-SY' : 'en-US',
          name: p.voice,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: p.speechRate,
          pitch: p.pitch,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`google tts failed (${res.status}): ${body.slice(0, 160)}`);
    }
    const data: any = await res.json().catch(() => ({}));
    const content = (data?.audioContent ?? '') as string;
    if (!content) throw new Error('google tts empty audioContent');
    return { uri: await writeBase64Cache(content, 'mp3') };
  } finally {
    controller.abort();
  }
}

/** VoiceRSS: GET tts with key → audio bytes (mp3/mpeg). */
async function voiceRss(p: TtsRouterPayload, key: string, signal?: AbortSignal): Promise<{ uri: string }> {
  const params = new URLSearchParams({
    key,
    hl: voiceRssLang(p.locale),
    src: p.text,
    c: 'MP3',
    f: '8khz_8bit_mono',
  });
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) throw new Error('aborted');
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(`${VOICERSS_BASE}/?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`voicerss failed (${res.status})`);
    const contentType = res.headers?.get?.('content-type') ?? '';
    if (!contentType.includes('audio') && !contentType.includes('octet')) {
      const body = await res.text().catch(() => '');
      throw new Error(`voicerss not audio (${contentType}): ${body.slice(0, 160)}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { File, Paths } = await import('expo-file-system');
    const file = new File(Paths.cache, `vr-tts-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mp3`);
    file.write(bytes);
    return { uri: file.uri };
  } finally {
    controller.abort();
  }
}

/** Persist a base64 payload (e.g. Google audioContent) to a cache file. */
async function writeBase64Cache(base64: string, ext: string): Promise<string> {
  const { File, Paths } = await import('expo-file-system');
  const file = new File(
    Paths.cache,
    `gk-tts-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`,
  );
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/**
 * Synthesize speech through the router. Tries, in order:
 *   gateway (free edge-tts) → google-tts (key) → voicerss (key).
 * Returns `null` when nothing could be produced (native TTS fallback follows).
 * Never throws.
 */
export async function ttsRouter(
  payload: TtsRouterPayload,
  signal?: AbortSignal,
): Promise<{ uri: string } | null> {
  const gatewayAvailable = isVoiceGatewayConfigured();
  const keys = await getVoiceKeyEntries('tts');
  const order = voiceProviderOrder('tts', gatewayAvailable, keys.length);
  const usedKeys = new Map<string, boolean>();

  const releaseAll = () => {
    for (const [key, ok] of usedKeys) {
      void releaseVoiceKey('tts', key, ok);
    }
  };

  try {
    for (const provider of order) {
      try {
        if (provider === 'gateway') {
          voiceLog('VOICE_PROVIDER_SELECTED', 'tts:gateway(edge-tts)');
          const { uri } = await gatewayTts(gatewayPayload(payload), signal);
          return { uri };
        }
        if (provider === 'google-tts') {
          const picked = await acquireVoiceKey('tts');
          if (!picked) continue;
          usedKeys.set(picked.value, false);
          voiceLog('VOICE_PROVIDER_SELECTED', 'tts:google');
          const out = await googleTts(payload, picked.value, signal);
          usedKeys.set(picked.value, true);
          return out;
        }
        if (provider === 'voicerss') {
          const picked = await acquireVoiceKey('tts');
          if (!picked) continue;
          usedKeys.set(picked.value, false);
          voiceLog('VOICE_PROVIDER_SELECTED', 'tts:voicerss');
          const out = await voiceRss(payload, picked.value, signal);
          usedKeys.set(picked.value, true);
          return out;
        }
      } catch (err) {
        voiceLog('VOICE_PROVIDER_FAILED', `tts:${provider} - ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    releaseAll();
  }

  return null;
}