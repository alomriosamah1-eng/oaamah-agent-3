// OSAMAH VOICE KEYS — pure engine: chain normalization, rotation, cooldown,
// namespace independence, and free-first provider ordering.
import {
  normalizeVoiceKeyChain,
  createVoiceKeyCursor,
  nextVoiceKey,
  penalizeVoiceKey,
  voiceStorageKey,
  voiceProviderOrder,
  VOICE_KEY_COOLDOWN_MS,
} from '../utils/voice/vkeysCore';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('voiceKeys');

test('normalizeVoiceKeyChain: dedupes, trims, config before user, stamps kind', () => {
  const chain = normalizeVoiceKeyChain('stt', ['  K1 ', undefined, 'k2', 'K1'], ['k2', 'user1']);
  assertEqual(chain.map((k) => k.value), ['K1', 'k2', 'user1']);
  assertEqual(chain.map((k) => k.source), ['config', 'config', 'user']);
  assert(chain.every((k) => k.kind === 'stt'), 'kind stamped');
  assert(chain.every((k) => k.id.startsWith('vk-stt-')), 'id scoped by kind');
});

test('tts chain is separate from stt (kind-scoped ids + unique storage keys)', () => {
  const stt = normalizeVoiceKeyChain('stt', ['sk'], []);
  const tts = normalizeVoiceKeyChain('tts', ['tk'], []);
  assertNotEqual(stt[0].id, tts[0].id, 'stt/tts ids never collide');
  assertNotEqual(voiceStorageKey('stt'), voiceStorageKey('tts'), 'storage keys isolated');
  assertEqual(voiceStorageKey('stt', 'voice:keys:'), 'voice:keys:stt');
  assert(voiceStorageKey('stt').startsWith('voice:'), 'own namespace, not apiHub/flow');
});

test('nextVoiceKey rotation skips cooled keys and wraps around', () => {
  const cursor = createVoiceKeyCursor(normalizeVoiceKeyChain('tts', ['a', 'b', 'c']), 0);
  const first = nextVoiceKey(cursor, 1000);
  assertEqual(first?.key.value, 'a');
  penalizeVoiceKey(cursor, first!.key.id, 1000, 5000);
  const second = nextVoiceKey(cursor, 1000);
  assertEqual(second?.key.value, 'b');
  assertEqual(nextVoiceKey(cursor, 1000)?.key.value, 'c');
  // 'a' still cooled within window → served again after one full wrap
  assertEqual(nextVoiceKey(cursor, 3000)?.key.value, 'b');
  // cooldown of 'a' expires (1000 + 5000 = 6000 < 8000): usable again
  assertEqual(nextVoiceKey(cursor, 8000)?.key.value, 'c');
  assertEqual(nextVoiceKey(cursor, 8000)?.key.value, 'a');
});

test('nextVoiceKey: all cooled still returns a fallback (never deadlock)', () => {
  const cursor = createVoiceKeyCursor(normalizeVoiceKeyChain('stt', ['x']), 0);
  const pick = nextVoiceKey(cursor, 0, 1000);
  assert(pick !== null, 'single key always available');
  assertEqual(pick!.key.value, 'x');
});

test('nextVoiceKey: empty chain returns null', () => {
  const cursor = createVoiceKeyCursor([], 0);
  assertEqual(nextVoiceKey(cursor, 0), null);
});

test('voiceProviderOrder: gateway free-first, keys only when present, native last', () => {
  // STT: gateway when available; keyed google-stt only when keys exist.
  assertEqual(voiceProviderOrder('stt', true, 2), ['gateway', 'google-stt']);
  assertEqual(voiceProviderOrder('stt', true, 0), ['gateway']);
  assertEqual(voiceProviderOrder('stt', false, 2), ['google-stt']);
  assertEqual(voiceProviderOrder('stt', false, 0), []);

  // TTS: gateway → google → voicerss (keys) → native fallback always.
  assertEqual(voiceProviderOrder('tts', true, 2), ['gateway', 'google-tts', 'voicerss', 'native']);
  assertEqual(voiceProviderOrder('tts', true, 0), ['gateway', 'native']);
  assertEqual(voiceProviderOrder('tts', false, 1), ['google-tts', 'voicerss', 'native']);
  assertEqual(voiceProviderOrder('tts', false, 0), ['native']);
});

test('VOICE_KEY_COOLDOWN_MS is a sane penalty window', () => {
  assertEqual(VOICE_KEY_COOLDOWN_MS, 5 * 60_000);
});

function assertNotEqual(a: unknown, b: unknown, msg: string): void {
  assert(a !== b, msg);
}

export const runSuite = report;