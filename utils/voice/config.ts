// Voice configuration — mirrors the desktop assistant's fixed voice set
// (config/constants.py + the edge-tts chain in floating_assistant.py), with a
// couple of phone-suitable knobs. No provider modes, no voice catalogue:
// the desktop picks one neural voice by gender/language and we do the same.

import type { OrbStyleId } from '../orbs/gallery';
import { DEFAULT_GALLERY_STYLE, isGalleryStyle } from '../orbs/gallery/registry';
import type { PersonaId } from './persona';
import { isPersonaId } from './persona';

export type VoiceGender = 'female' | 'male';

export type VoiceLocale = 'ar-SY' | 'ar-SA' | 'en-US';

export interface VoiceConfig {
  locale: VoiceLocale;
  gender: VoiceGender;
  speakingRate: number;
  pitch: number;
  volume: number;
  /** Selected orb style from the voiceorbs gallery. */
  orbStyle: OrbStyleId;
  /** Active character: osamah (default) or ميرا / كريم by name. */
  persona: PersonaId;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  locale: 'ar-SY',
  gender: 'female',
  speakingRate: 1,
  pitch: 1,
  volume: 1,
  orbStyle: DEFAULT_GALLERY_STYLE,
  persona: 'osamah',
};

const KEY = 'voiceConfig';

export function normalizeVoiceConfig(raw: unknown): VoiceConfig {
  const base = { ...DEFAULT_VOICE_CONFIG };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  if (o.locale === 'ar-SY' || o.locale === 'ar-SA' || o.locale === 'en-US') {
    base.locale = o.locale as VoiceLocale;
  }
  if (o.gender === 'male' || o.gender === 'female') base.gender = o.gender;
  if (typeof o.speakingRate === 'number' && o.speakingRate > 0) {
    base.speakingRate = o.speakingRate;
  }
  if (typeof o.pitch === 'number' && o.pitch > 0) base.pitch = o.pitch;
  if (typeof o.volume === 'number' && o.volume >= 0) base.volume = o.volume;
  if (typeof o.orbStyle === 'string' && isGalleryStyle(o.orbStyle)) {
    base.orbStyle = o.orbStyle;
  }
  if (isPersonaId(o.persona)) base.persona = o.persona;
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