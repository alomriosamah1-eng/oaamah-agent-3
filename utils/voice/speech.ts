// Spoken output — the desktop assistant's TTS method on the phone.
//
// Desktop order (floating_assistant.py `_speak_sync`): edge-tts first (streamed
// neural audio), then a local fallback. Here edge-tts is reached through the
// voice gateway (`/voice/tts`, MP3). Synthesis is separated from playback so
// the conversation loop can PREFETCH the next sentence while the current one
// is still speaking — that overlap is what removes the gap between sentences.
// If the gateway/cloud fails, the platform's own engine (expo-speech) serves
// the same fallback role as the desktop's gTTS/espeak.
//
// Voice pick mirrors the desktop: Arabic text → the Arabic neural voice chosen
// by the configured gender, anything else → an English neural voice.

import { speakableText, splitChunks, applyPronunciationLexicon } from './text';
import { ttsRouter } from './providers/ttsRouter';
import type { VoiceConfig } from './config';
import { voiceLog } from './log';

/** Desktop `has_arabic()`: any char in the Arabic block counts. */
export function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export interface SpeakOptions {
  signal?: AbortSignal;
}

// Microsoft Edge neural voices, one per gender × dialect. The Syrian pair
// (Amany/Laith) reads Levantine; the MSA pair (ar-SA) reads Modern Standard
// Arabic. English keeps the SAME gender as the Arabic voice — otherwise a
// bilingual reply would be spoken by two different people in one turn.
// Both genders share the same rate/pitch — only the timbre differs — so
// switching takes nothing else with it.
const EDGE_VOICES = {
  female_ar_sy: 'ar-SY-AmanyNeural',
  male_ar_sy: 'ar-SY-LaithNeural',
  female_ar_sa: 'ar-SA-ZariyahNeural',
  male_ar_sa: 'ar-SA-HamedNeural',
  en: 'en-US-AriaNeural',
  female_en: 'en-US-AriaNeural',
  male_en: 'en-US-GuyNeural',
} as const;

/** Each synthesized chunk must fit the gateway's 1000-char cap. */
const GATEWAY_MAX_CHARS = 700;

/** Resolve the voice id + request locale for a piece of text. */
function pickVoice(config: VoiceConfig, text: string): { voice: string; locale: string } {
  const language = hasArabic(text) ? 'ar' : 'en';
  const voice =
    language === 'en'
      ? config.gender === 'male'
        ? EDGE_VOICES.male_en
        : EDGE_VOICES.female_en
      : config.locale === 'ar-SA'
        ? config.gender === 'male'
          ? EDGE_VOICES.male_ar_sa
          : EDGE_VOICES.female_ar_sa
        : config.gender === 'male'
          ? EDGE_VOICES.male_ar_sy
          : EDGE_VOICES.female_ar_sy;
  return { voice, locale: language === 'en' ? 'en-US' : config.locale };
}

/**
 * Synthesize `text` into local audio file(s) — NO playback. Returns the uris
 * (normally one) or null when remote synthesis produced nothing (the caller
 * falls back to the platform TTS). The first syllable can start as soon as its
 * file exists, while later sentences are still synthesizing.
 */
export async function synthesizeSpeech(
  text: string,
  config: VoiceConfig,
  opts: SpeakOptions = {},
): Promise<{ uris: string[] } | null> {
  if (!text.trim()) return null;
  // Only real text and numbers may reach the voice — strip emojis, links and
  // decorative symbols regardless of which provider ends up synthesizing.
  text = applyPronunciationLexicon(speakableText(text));
  if (!text.trim()) return null;
  const { voice, locale } = pickVoice(config, text);

  const chunks = splitChunks(text, GATEWAY_MAX_CHARS);
  const uris: string[] = [];
  for (const chunk of chunks) {
    if (opts.signal?.aborted) return null;
    try {
      const out = await ttsRouter(
        {
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
      if (!out) break; // gateway/cloud unavailable — native fallback follows
      uris.push(out.uri);
      voiceLog('VOICE_STREAM_STARTED', `tts ${chunk.length}ch`);
    } catch {
      break; // a provider blew up — fall back to the platform TTS
    }
  }
  if (!uris.length) return null;
  return { uris };
}

/** expo-speech fallback — the phone's equivalent of the desktop's local TTS. */
export async function speakNativeSpeech(
  text: string,
  config: VoiceConfig,
  signal?: AbortSignal,
): Promise<void> {
  text = applyPronunciationLexicon(speakableText(text));
  if (!text.trim()) return;
  const { locale } = pickVoice(config, text);
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