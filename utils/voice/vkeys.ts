// OSAMAH VOICE KEYS — RN store (config + AsyncStorage persistence).
//
// Independent keys for the voice section only (STT/TTS). Reads baked-in keys
// from `expoConfig.extra` (voiceApiKeys / voiceTtsKeys) and user-added keys
// from AsyncStorage under a dedicated namespace, and exposes rotation +
// cooldown via the pure core. Shares nothing with the apiHub / FLOW key store.

import Constants from 'expo-constants';
import { storage } from '@/utils/Storage';
import {
  normalizeVoiceKeyChain,
  createVoiceKeyCursor,
  nextVoiceKey,
  penalizeVoiceKey,
  voiceStorageKey,
  VOICE_KEY_COOLDOWN_MS,
  type VoiceKeyEntry,
  type VoiceKeyKind,
  type VoiceKeyCursor,
} from '@/utils/voice/vkeysCore';

export { voiceProviderOrder, VOICE_KEY_COOLDOWN_MS } from '@/utils/voice/vkeysCore';
export type { VoiceKeyEntry, VoiceKeyKind, VoiceProviderId } from '@/utils/voice/vkeysCore';

/* ------------------------------------------------------------------ */
/* Config keys                                                          */
/* ------------------------------------------------------------------ */

function configKeyValues(kind: VoiceKeyKind): Array<string | undefined> {
  const extra = Constants.expoConfig?.extra as
    | { voiceApiKeys?: string[]; voiceTtsKeys?: string[] }
    | undefined;
  const arr = kind === 'stt' ? extra?.voiceApiKeys : extra?.voiceTtsKeys;
  return Array.isArray(arr) ? arr : [];
}

async function userKeyValues(kind: VoiceKeyKind): Promise<string[]> {
  try {
    const raw = await storage.getString(voiceStorageKey(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** Full key chain for a kind (config keys first, user keys appended). */
export async function getVoiceKeyEntries(kind: VoiceKeyKind): Promise<VoiceKeyEntry[]> {
  const user = await userKeyValues(kind);
  return normalizeVoiceKeyChain(kind, configKeyValues(kind), user);
}

/* ------------------------------------------------------------------ */
/* Rotation cursor (per kind, cached briefly)                           */
/* ------------------------------------------------------------------ */

const CURSOR_CACHE_MS = 15_000;
const cursors = new Map<VoiceKeyKind, { cursor: VoiceKeyCursor; at: number }>();

async function cursorFor(kind: VoiceKeyKind, now = Date.now()): Promise<VoiceKeyCursor> {
  const cached = cursors.get(kind);
  if (cached && now - cached.at < CURSOR_CACHE_MS) return cached.cursor;
  const cursor = createVoiceKeyCursor(await getVoiceKeyEntries(kind), now);
  cursors.set(kind, { cursor, at: now });
  return cursor;
}

/** Grab the next usable key for a kind (skips cooled-down ones). */
export async function acquireVoiceKey(
  kind: VoiceKeyKind,
  now = Date.now(),
): Promise<{ value: string; kind: VoiceKeyKind } | null> {
  const cursor = await cursorFor(kind, now);
  const pick = nextVoiceKey(cursor, now, VOICE_KEY_COOLDOWN_MS);
  return pick ? { value: pick.key.value, kind } : null;
}

/** Book-keep an attempt outcome: failures penalize the key (cooldown). */
export async function releaseVoiceKey(
  kind: VoiceKeyKind,
  usedValue: string,
  success: boolean,
  now = Date.now(),
): Promise<void> {
  const cursor = await cursorFor(kind, now);
  const entry = cursor.values.find((k) => k.value === usedValue);
  if (!entry) return;
  if (!success) penalizeVoiceKey(cursor, entry.id, now, VOICE_KEY_COOLDOWN_MS);
}

/* ------------------------------------------------------------------ */
/* User-managed keys                                                    */
/* ------------------------------------------------------------------ */

export async function addUserVoiceKey(kind: VoiceKeyKind, value: string): Promise<void> {
  const v = (value ?? '').trim();
  if (!v) return;
  const user = await userKeyValues(kind);
  if (user.includes(v)) return;
  user.push(v);
  await storage.set(voiceStorageKey(kind), JSON.stringify(user));
  cursors.delete(kind); // bust cache
}

export async function removeUserVoiceKey(kind: VoiceKeyKind, value: string): Promise<void> {
  const user = (await userKeyValues(kind)).filter((k) => k !== value);
  await storage.set(voiceStorageKey(kind), JSON.stringify(user));
  cursors.delete(kind);
}