// OSAMAH VOICE KEYS — pure core (no RN / Expo imports → Node-testable).
//
// A fully independent key chain for the voice section (STT + TTS). It mirrors
// the apiHub rotation semantics but shares NOTHING with it — separate storage
// namespace, separate cursor state, separate types — so voice and FLOW can
// never interfere with each other. Free providers are always tried before any
// keyed provider (gateway/edge-tts first, then user/cloud keys).

export type VoiceKeyKind = 'stt' | 'tts';

export interface VoiceKeyEntry {
  id: string;
  kind: VoiceKeyKind;
  value: string;
  source: 'config' | 'user';
  addedAt: number;
}

export interface VoiceKeyCursor {
  values: VoiceKeyEntry[];
  cooldownUntil: Map<string, number>;
  cursor: number;
}

export const VOICE_KEY_COOLDOWN_MS = 5 * 60_000;

/** Storage namespace key for a kind — isolated from every other subsystem. */
export function voiceStorageKey(kind: VoiceKeyKind, prefix = 'voice:keys:'): string {
  return `${prefix}${kind}`;
}

/* ------------------------------------------------------------------ */
/* Key chain                                                            */
/* ------------------------------------------------------------------ */

/** Config keys keep their order first, user keys are appended after. */
export function normalizeVoiceKeyChain(
  kind: VoiceKeyKind,
  configValues: Array<string | undefined>,
  userValues: Array<string | undefined> = [],
): VoiceKeyEntry[] {
  const seen = new Set<string>();
  const out: VoiceKeyEntry[] = [];
  const now = Date.now();

  const push = (value: string | undefined, source: 'config' | 'user') => {
    const v = (value ?? '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({
      id: `vk-${kind}-${source}-${v.slice(-6)}-${out.length}`,
      kind,
      value: v,
      source,
      addedAt: now,
    });
  };

  for (const v of configValues) push(v, 'config');
  for (const v of userValues) push(v, 'user');
  return out;
}

export function createVoiceKeyCursor(entries: VoiceKeyEntry[], now = Date.now()): VoiceKeyCursor {
  return { values: entries, cooldownUntil: new Map(), cursor: 0 };
}

/** Next usable key with round-robin; skips cooled-down ones. Never deadlocks. */
export function nextVoiceKey(
  cursor: VoiceKeyCursor,
  now = Date.now(),
  cooldownMs = VOICE_KEY_COOLDOWN_MS,
): { key: VoiceKeyEntry; index: number } | null {
  if (cursor.values.length === 0) return null;

  let attempts = cursor.values.length;
  let i = cursor.cursor;
  while (attempts > 0) {
    const entry = cursor.values[i];
    if ((cursor.cooldownUntil.get(entry.id) ?? 0) <= now) {
      cursor.cursor = (i + 1) % cursor.values.length;
      return { key: entry, index: i };
    }
    i = (i + 1) % cursor.values.length;
    attempts -= 1;
  }

  // All cooled down — allow the chain again after a full cycle.
  const fallback = cursor.values[cursor.cursor];
  cursor.cursor = (cursor.cursor + 1) % cursor.values.length;
  return fallback ? { key: fallback, index: (cursor.cursor + cursor.values.length - 1) % cursor.values.length } : null;
}

/** Mark a key failed so it is skipped for the cooldown window. */
export function penalizeVoiceKey(
  cursor: VoiceKeyCursor,
  keyId: string,
  now = Date.now(),
  cooldownMs = VOICE_KEY_COOLDOWN_MS,
): void {
  cursor.cooldownUntil.set(keyId, now + cooldownMs);
}

/* ------------------------------------------------------------------ */
/* Provider ordering (free-first)                                       */
/* ------------------------------------------------------------------ */

export type VoiceProviderId = 'gateway' | 'google-stt' | 'google-tts' | 'voicerss' | 'native';

/**
 * Deterministic provider order for a kind. The gateway (free edge-tts / Google
 * STT) is always tried before any keyed provider; native TTS is the final
 * fallback. `keyCount` gates the keyed providers so nothing is attempted with
 * an empty chain.
 */
export function voiceProviderOrder(
  kind: VoiceKeyKind,
  gatewayAvailable: boolean,
  keyCount: number,
): VoiceProviderId[] {
  if (kind === 'stt') {
    const order: VoiceProviderId[] = [];
    if (gatewayAvailable) order.push('gateway');
    if (keyCount > 0) order.push('google-stt');
    return order;
  }

  const order: VoiceProviderId[] = [];
  if (gatewayAvailable) order.push('gateway');
  if (keyCount > 0) {
    order.push('google-tts');
    order.push('voicerss');
  }
  order.push('native');
  return order;
}