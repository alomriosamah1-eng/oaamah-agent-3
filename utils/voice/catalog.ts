// Voice catalogue: the dialects Osamah agent can speak, with the voiced IDs
// each provider uses for a given (locale, gender). Only this one table knows
// about specific provider voices — the UI, engine and router never hard-code
// one. A future voice gateway resolves these IDs server-side; until a gateway
// URL is configured the built-in device TTS covers the same locales.

import { VoiceGender } from './config';

export interface LocaleCatalog {
  /** Speech/microphone + native-TTS language hint (BCP-47-ish). */
  native?: string;
  /** Microsoft Azure neural voice id. */
  azure: Record<VoiceGender, string>;
  /** Google Cloud TTS voice name (gateway resolves premium vs standard). */
  google: Record<VoiceGender, string>;
}

export type VoiceLocale =
  | 'ar-SY'
  | 'ar-YE'
  | 'ar-SA'
  | 'ar-EG'
  | 'ar-AE'
  | 'ar-JO'
  | 'ar-IQ'
  | 'ar-KW'
  | 'ar-LB'
  | 'ar-OM'
  | 'ar-QA';

export const SUPPORTED_LOCALES: VoiceLocale[] = [
  'ar-SY',
  'ar-YE',
  'ar-SA',
  'ar-EG',
  'ar-AE',
  'ar-JO',
  'ar-IQ',
  'ar-KW',
  'ar-LB',
  'ar-OM',
  'ar-QA',
];

export const VOICE_CATALOG: Record<VoiceLocale, LocaleCatalog> = {
  'ar-SY': {
    native: 'ar-SY',
    azure: { male: 'ar-SY-LaithNeural', female: 'ar-SY-AmanyNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-YE': {
    native: 'ar-YE',
    azure: { male: 'ar-YE-SalehNeural', female: 'ar-YE-MaryamNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-SA': {
    native: 'ar-SA',
    azure: { male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-EG': {
    native: 'ar-EG',
    azure: { male: 'ar-EG-ShakirNeural', female: 'ar-EG-SalmaNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-AE': {
    native: 'ar-AE',
    azure: { male: 'ar-AE-HamdanNeural', female: 'ar-AE-FatimaNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-JO': {
    native: 'ar-JO',
    azure: { male: 'ar-JO-TaimNeural', female: 'ar-JO-HalaNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-IQ': {
    native: 'ar-IQ',
    azure: { male: 'ar-IQ-BasselNeural', female: 'ar-IQ-RanaNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-KW': {
    native: 'ar-KW',
    azure: { male: 'ar-KW-FahedNeural', female: 'ar-KW-NouraNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-LB': {
    native: 'ar-LB',
    azure: { male: 'ar-LB-RamiNeural', female: 'ar-LB-LaylaNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-OM': {
    native: 'ar-OM',
    azure: { male: 'ar-OM-AbdullahNeural', female: 'ar-OM-AyshaNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
  'ar-QA': {
    native: 'ar-QA',
    azure: { male: 'ar-QA-MoazNeural', female: 'ar-QA-AmalNeural' },
    google: { male: 'ar-XA-Wavenet-B', female: 'ar-XA-Wavenet-A' },
  },
};

export function catalogFor(
  locale: VoiceLocale,
  gender: VoiceGender,
): { azure: string; google: string; native?: string } {
  const entry = VOICE_CATALOG[locale] ?? VOICE_CATALOG['ar-SY'];
  return {
    azure: entry.azure[gender],
    google: entry.google[gender],
    native: entry.native,
  };
}