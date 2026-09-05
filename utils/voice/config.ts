// User-facing voice configuration — the single source of truth the UI, engine
// and providers all read from. Stored locally only; no provider credentials
// live anywhere in the app.

import { VoiceLocale } from './catalog';

export type VoiceGender = 'male' | 'female';

export type ProviderMode = 'auto' | 'azure' | 'google' | 'android';

export interface VoiceConfig {
  locale: VoiceLocale;
  gender: VoiceGender;
  mode: ProviderMode;
  speakingRate: number;
  pitch: number;
  volume: number;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  locale: 'ar-SY',
  gender: 'female',
  mode: 'auto',
  speakingRate: 1,
  pitch: 1,
  volume: 1,
};

const KEY = 'voiceConfig';

export function normalizeVoiceConfig(raw: unknown): VoiceConfig {
  const base = { ...DEFAULT_VOICE_CONFIG };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.locale === 'string') base.locale = o.locale as VoiceLocale;
  if (o.gender === 'male' || o.gender === 'female') base.gender = o.gender;
  if (
    o.mode === 'auto' ||
    o.mode === 'azure' ||
    o.mode === 'google' ||
    o.mode === 'android'
  ) {
    base.mode = o.mode;
  }
  if (typeof o.speakingRate === 'number' && o.speakingRate > 0) {
    base.speakingRate = o.speakingRate;
  }
  if (typeof o.pitch === 'number' && o.pitch > 0) base.pitch = o.pitch;
  if (typeof o.volume === 'number' && o.volume >= 0) base.volume = o.volume;
  return base;
}

export async function loadVoiceConfig(): Promise<VoiceConfig> {
  try {
    const { storage } = await import('@/utils/Storage');
    const raw = await storage.getString(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return normalizeVoiceConfig(parsed);
  } catch {
    return { ...DEFAULT_VOICE_CONFIG };
  }
}

export async function saveVoiceConfig(config: VoiceConfig): Promise<void> {
  try {
    const { storage } = await import('@/utils/Storage');
    await storage.set(KEY, JSON.stringify(config));
  } catch {
    // storage unavailable — config still applies for this session
  }
}