// OSAMAH API HUB — pure engine: key rotation, failover, instance parsing/merge.
import {
  normalizeKeyChain,
  createKeyCursor,
  nextKey,
  penalizeKey,
  parseInvidiousInstances,
  parsePipedInstances,
  mergeInstances,
  buildCandidateOrder,
  markAttempt,
  runWithFailover,
  type ExternalInstance,
} from '../utils/apiHub/core';
import { catalogFor, findCatalogEntry } from '../utils/apiHub/catalog';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('apiHub');

test('normalizeKeyChain: dedupes, trims, config before user', () => {
  const chain = normalizeKeyChain(['  K1 ', undefined, 'k2', 'K1'], ['k2', 'user1']);
  assertEqual(chain.map((k) => k.value), ['K1', 'k2', 'user1']);
  assertEqual(chain.map((k) => k.source), ['config', 'config', 'user']);
});

test('nextKey rotation skips cooled keys and wraps around', () => {
  const cursor = createKeyCursor(normalizeKeyChain(['a', 'b', 'c']), 0);
  const first = nextKey(cursor, 1000);
  assertEqual(first?.key.value, 'a');
  penalizeKey(cursor, first!.key.id, 1000, 5000);
  const second = nextKey(cursor, 1000);
  assertEqual(second?.key.value, 'b');
  assertEqual(nextKey(cursor, 1000)?.key.value, 'c');
  // 'a' still cooled within window → served again after one full wrap
  assertEqual(nextKey(cursor, 3000)?.key.value, 'b');
  // cooldown of 'a' expires (6000 < 8000): usable again on next wrap
  assertEqual(nextKey(cursor, 8000)?.key.value, 'c');
  assertEqual(nextKey(cursor, 8000)?.key.value, 'a');
});

test('nextKey: all cooled still returns a fallback (never deadlock)', () => {
  const cursor = createKeyCursor(normalizeKeyChain(['x']), 0);
  const pick = nextKey(cursor, 0, 1000);
  assert(pick !== null, 'single key always available');
});

test('runWithFailover: returns first success, reports failures', () => {
  const seen: string[] = [];
  let attempts = 0;
  const res = runWithFailover<string>(
    ['a', 'b', 'c'],
    (candidate) => {
      attempts += 1;
      if (candidate === 'a') throw new Error('boom');
      return Promise.resolve(`ok-${candidate}`);
    },
    (candidate, ok) => {
      seen.push(`${candidate}:${ok}`);
    },
  );
  return Promise.resolve(res).then((r) => {
    assert(r.ok === true, 'succeeded on second candidate');
    assertEqual(r.value, 'ok-b');
    assertEqual(r.used, 'b');
    assertEqual(attempts, 2);
    assertEqual(seen, ['a:false', 'b:true']);
  });
});

test('runWithFailover: all fail → ok=false with last error', () => {
  return runWithFailover<number>(['a'], () => Promise.reject(new Error('down'))).then((r) => {
    assert(r.ok === false, 'fails through');
    assertEqual((r.error as Error).message, 'down');
  });
});

test('parseInvidiousInstances: keeps usable https entries', () => {
  const raw = JSON.stringify([
    ['inv.nadeko.net', { uri: 'https://inv.nadeko.net', type: ['http', 'https'] }],
    ['bad', { uri: 'not-a-url' }],
    ['api-host', { api: 'https://yewtu.be' }],
    ['empty', {}],
  ]);
  const list = parseInvidiousInstances(raw, 42);
  assertEqual(list.length, 2);
  assert(list.every((i) => i.baseUrl.startsWith('https://')), 'https only');
  assertEqual(list[0].kind, 'invidious');
});

test('parsePipedInstances: object + string + wrapper shapes', () => {
  const obj = parsePipedInstances(JSON.stringify([{ name: 'a', api_url: 'https://pipedapi.kavin.rocks' }, { name: 'b', host: 'api.piped.yt' }]), 0);
  assertEqual(obj.map((i) => i.baseUrl), ['https://pipedapi.kavin.rocks', 'https://api.piped.yt']);
  const strings = parsePipedInstances(JSON.stringify(['https://c.example', 'd.example/']), 0);
  assertEqual(strings.map((i) => i.baseUrl), ['https://c.example', 'https://d.example']);
  const wrapped = parsePipedInstances(JSON.stringify({ instances: [{ api_url: 'https://e.example' }] }), 0);
  assertEqual(wrapped.length, 1);
  const bad = parsePipedInstances('not json', 0);
  assertEqual(bad, []);
});

test('mergeInstances: fresh replaces, user preserved, empty fresh keeps previous', () => {
  const bundled: ExternalInstance[] = [
    { id: 'b1', kind: 'piped', baseUrl: 'https://old.example', healthy: true, source: 'bundled' },
  ];
  const user: ExternalInstance[] = [
    { id: 'u1', kind: 'piped', baseUrl: 'https://private.example', healthy: true, source: 'user' },
  ];
  const fresh: ExternalInstance[] = [
    { id: 'f1', kind: 'piped', baseUrl: 'https://fresh.example', healthy: true, source: 'discovered' },
    { id: 'f2', kind: 'piped', baseUrl: 'https://private.example', healthy: false, source: 'discovered' },
  ];

  const merged = mergeInstances([...user, ...bundled], fresh, bundled);
  const urls = merged.map((i) => i.baseUrl);
  assert(urls.includes('https://private.example'), 'user entry survives');
  assert(urls.includes('https://fresh.example'), 'fresh entry added');
  assert(urls.includes('https://old.example'), 'bundled seed still present');

  const keptPrev = mergeInstances([...user, ...bundled], [], bundled);
  assertEqual(keptPrev.length, 2, 'empty fresh → previous list intact');

  const seeded = mergeInstances([], [], bundled);
  assertEqual(seeded.map((i) => i.baseUrl), ['https://old.example'], 'fresh+prev empty → seed used');
});

test('buildCandidateOrder + markAttempt: dead instances sink', () => {
  let instances: ExternalInstance[] = [
    { id: 'a', kind: 'piped', baseUrl: 'https://a.example', healthy: true, source: 'bundled', latencyMs: 1200 },
    { id: 'b', kind: 'piped', baseUrl: 'https://b.example', healthy: true, source: 'discovered', latencyMs: 300 },
    { id: 'c', kind: 'piped', baseUrl: 'https://c.example', healthy: false, source: 'discovered' },
  ];
  assertEqual(buildCandidateOrder(instances, 'piped'), ['https://b.example', 'https://a.example', 'https://c.example']);

  // three fails on the best instance → it drops behind the healthy one
  for (let i = 0; i < 3; i += 1) instances = markAttempt(instances, 'https://b.example', false, 1000 + i);
  const order = buildCandidateOrder(instances, 'piped');
  assertEqual(order[0], 'https://a.example');
  assertEqual(order[1], 'https://b.example'); // degraded, but latency better than c
  assertEqual(order[2], 'https://c.example'); // unhealthy + slow sinks last

  // one success restores it
  instances = markAttempt(instances, 'https://b.example', true, 5000);
  assertEqual(buildCandidateOrder(instances, 'piped')[0], 'https://b.example');
});

test('catalogFor: sorted by priority; findCatalogEntry resolves', () => {
  const social = catalogFor('social');
  assert(social.length > 0, 'social category non-empty');
  for (let i = 1; i < social.length; i += 1) {
    assert(social[i - 1].priority <= social[i].priority, 'priority ascending');
  }
  assert(findCatalogEntry('youtube-data')?.baseUrl.includes('youtube'), 'entry found');
  assert(findCatalogEntry('nope') === undefined, 'missing id undefined');
});

export const runSuite = report;