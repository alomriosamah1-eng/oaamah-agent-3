// The voice gateway — the ONLY component allowed to hold cloud provider
// secrets, and it does not exist in the app at all. This file is the thin
// authenticated client the app talks to. The gateway lives behind an
// HTTPS-enabled endpoint configured via `extra.voiceGatewayUrl` (never a key).
//
// Protocol (future gateway):
//   GET  {gateway}/voice/status      -> { ok, providers: [..], voices: [..] }
//   POST {gateway}/voice/tts         -> audio bytes
//         body: { provider, text, locale, gender, voice, speechRate, pitch, volume }
//   POST {gateway}/voice/transcribe  -> { text } (optional future STT)
//
// Until a gateway URL is set the cloud providers report unavailable and the
// router falls through to the built-in Android/iOS TTS — the app stays fully
// functional offline, just with a more limited voice set.

import Constants from 'expo-constants';

/**
 * Resolve the voice gateway endpoint. Priority:
 *   1. `EXPO_PUBLIC_VOICE_GATEWAY_URL` in `.env` (explicit override — the
 *      only way to point at a gateway not colocated with Metro),
 *   2. the Metro host (Expo Go / dev) — the machine serving the bundle is
 *      also where `server/voice_gateway.py` runs, so `hostUri` is
 *      auto-discovered and voice works with zero configuration on the same
 *      Wi-Fi. This wins over any baked-in IP because the baked IP goes stale
 *      the moment the machine's DHCP lease changes,
 *   3. `extra.voiceGatewayUrl` baked into `app.json` (production builds,
 *      where there is no Metro host).
 * The path is appended at the call sites (`/voice/tts`, `/voice/status`,
 * `/voice/transcribe`), matching the protocol served by `server/voice_gateway.py`.
 */
export function voiceGatewayUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_VOICE_GATEWAY_URL ?? '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  // Metro host: "192.168.1.50:8081" → "http://192.168.1.50:8100". Expo Go
  // reliably exposes it as `expoConfig.hostUri`; `expoGoConfig.debuggerHost`
  // is the classic fallback for older manifests.
  const hostUri =
    (Constants.expoConfig?.hostUri ?? '').trim() ||
    ((Constants.expoGoConfig as { debuggerHost?: string | null } | null)?.debuggerHost ?? '').trim();
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:8100`;
  const extra = Constants.expoConfig?.extra as { voiceGatewayUrl?: string } | undefined;
  return (extra?.voiceGatewayUrl ?? '').trim().replace(/\/+$/, '');
}

export function isVoiceGatewayConfigured(): boolean {
  return voiceGatewayUrl().length > 0;
}

export interface GatewayTtsPayload {
  provider: 'azure' | 'google';
  text: string;
  locale: string;
  gender: 'male' | 'female';
  voice: string;
  speechRate: number;
  pitch: number;
  volume: number;
}

/** POST synthesized audio from the gateway and persist to a cache file. */
export async function gatewayTts(
  payload: GatewayTtsPayload,
  signal?: AbortSignal,
): Promise<{ uri: string; sampleRate?: number }> {
  const gateway = voiceGatewayUrl();
  if (!gateway) throw new Error('voice gateway not configured');
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) throw new Error('aborted');
    signal.addEventListener(
      'abort',
      () => controller.abort(),
      { once: true },
    );
  }
  try {
    const res = await fetch(`${gateway}/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`gateway tts failed (${res.status}): ${body.slice(0, 160)}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { File, Paths } = await import('expo-file-system');
    const ext = res.headers?.get?.('content-type')?.includes('mpeg') ? 'mp3' : 'm4a';
    const file = new File(
      Paths.cache,
      `gw-tts-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`,
    );
    file.write(bytes);
    return { uri: file.uri };
  } finally {
    controller.abort();
  }
}

/** Probe the gateway so the router can skip unreachable cloud providers. */
export async function gatewayStatus(): Promise<boolean> {
  const gateway = voiceGatewayUrl();
  if (!gateway) return false;
  try {
    const res = await fetch(`${gateway}/voice/status`);
    if (!res.ok) return false;
    const data: any = await res.json().catch(() => ({}));
    return data?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Upload a recorded audio file and return its transcription.
 * Works in Expo Go — recording is done with expo-audio (bundled), the audio
 * file goes to the gateway only.
 */
export async function gatewayTranscribe(uri: string, locale: string): Promise<string> {
  const gateway = voiceGatewayUrl();
  if (!gateway) throw new Error('voice gateway not configured');
  const form = new FormData();
  form.append('locale', locale);
  form.append('audio', {
    uri,
    name: `voice-${Date.now()}.m4a`,
    type: 'audio/m4a',
  } as any);
  const res = await fetch(`${gateway}/voice/transcribe`, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`gateway transcribe failed (${res.status}): ${body.slice(0, 160)}`);
  }
  const data: any = await res.json().catch(() => ({}));
  const text = (data?.text ?? '') as string;
  return text.trim();
}