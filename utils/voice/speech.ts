// Spoken output — the desktop assistant's TTS method on the phone.
//
// Desktop order (floating_assistant.py `_speak_sync`): edge-tts first (streamed
// neural audio), then a local fallback. Here edge-tts is reached through the
// voice gateway (`/voice/tts`, MP3) and played with the injected expo-audio
// player; if the gateway fails the platform's own speech engine (expo-speech)
// serves the same fallback role as the desktop's gTTS/espeak.
//
// Voice pick mirrors the desktop: Arabic text → the Arabic neural voice chosen
// by the configured gender, anything else → an English neural voice.

import { splitChunks } from './text';
import { gatewayTts } from './providers/gateway';
import type { VoiceConfig } from './config';
import { voiceLog } from './log';

/** The concrete audio output the loop talks to (player lives in the UI layer). */
export interface SpeechAudio {
  /** Play a remote/local audio URI to completion. Resolves on finish or stop. */
  play(uri: string): Promise<void>;
  setVolume(volume: number): void;
  /** Stop whatever is playing and resolve any pending play(). */
  stop(): void;
}

/** Desktop `has_arabic()`: any char in the Arabic block counts. */
export function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export interface SpeakOptions {
  signal?: AbortSignal;
}

const EDGE_VOICES = {
  female_ar_sy: 'ar-SY-AmanyNeural',
  male_ar_sy: 'ar-SY-LaithNeural',
  en: 'en-US-AriaNeural',
} as const;

/** Each synthesized chunk must fit the gateway's 1000-char cap. */
const GATEWAY_MAX_CHARS = 700;

/**
 * Speak `text` (possibly split into chunks, like the desktop plays the reply
 * as it is produced) over the configured voice. Falls back to the platform TTS
 * per chunk when the gateway is unreachable, so a reply always comes out.
 */
export async function speak(
  text: string,
  config: VoiceConfig,
  audio: SpeechAudio,
  opts: SpeakOptions = {},
): Promise<void> {
  if (!text.trim()) return;
  const language = hasArabic(text) ? 'ar' : 'en';
  const voice =
    language === 'en'
      ? EDGE_VOICES.en
      : config.gender === 'male'
        ? EDGE_VOICES.male_ar_sy
        : EDGE_VOICES.female_ar_sy;
  const locale = language === 'en' ? 'en-US' : config.locale;

  const chunks = splitChunks(text, GATEWAY_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (opts.signal?.aborted) return;

    let played = false;
    try {
      const { uri } = await gatewayTts(
        {
          provider: 'azure',
          text: chunk,
          locale,
          gender: config.gender,
          voice,
          speechRate: config.speakingRate,
          pitch: config.pitch,
          volume: 1,
        },
        opts.signal,
      );
      voiceLog('VOICE_STREAM_STARTED', `edge-tts ${chunk.length}ch`);
      await audio.play(uri);
      played = true;
      voiceLog('VOICE_STREAM_COMPLETED', 'edge-tts-done');
    } catch {
      // gateway unreachable/timed out — desktop parity: local engine fallback
      if (opts.signal?.aborted) return;
    }
    if (!played) {
      await speakNative(chunk, locale, config, opts.signal);
    }
  }
}

/** expo-speech fallback — the phone's equivalent of the desktop's local TTS. */
async function speakNative(
  text: string,
  locale: string,
  config: VoiceConfig,
  signal?: AbortSignal,
): Promise<void> {
  const SpeechModule = await import('expo-speech').catch(() => null);
  if (!SpeechModule) return;
  voiceLog('VOICE_STREAM_STARTED', `native ${text.length}ch`);
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      voiceLog('VOICE_STREAM_COMPLETED', 'native-done');
      resolve();
    };
    try {
      SpeechModule.speak(text, {
        language: locale || 'ar-SY',
        pitch: config.pitch,
        rate: config.speakingRate,
        onDone: finish,
        onStopped: finish,
        onError: () => finish(),
      });
    } catch {
      finish();
      return;
    }
    signal?.addEventListener('abort', finish, { once: true });
  });
}