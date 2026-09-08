// Storage Maintenance — safety boundary + pure logic tests.
//
// The hard rule: cleaning may ONLY touch user-scope data (inputs/outputs).
// If any of these assertions break, a future change is trying to touch the
// system (connection, keys, settings, feed tables) and must be rejected.

import { makeSuite, assert, assertEqual } from './helpers';
import {
  assembleBreakdown,
  bytesLabel,
  freedBytes,
  isCleanSurfaceSafe,
  ALL_CATEGORIES,
  CACHE_ONLY_TABLES,
  PROTECTED_ASYNC_KEYS,
  PROTECTED_TABLES,
  RECORDS_TABLES,
  USER_ASYNC_KEYS,
  USER_DATA_TABLES,
} from '../utils/storageMaintenance/core';

export async function runSuite(): Promise<void> {
  const suite = makeSuite('storage-maintenance');

  suite.test('clean surface never overlaps the protected boundary', () => {
    const user = new Set(USER_ASYNC_KEYS);
    const sys = new Set(PROTECTED_ASYNC_KEYS);
    assertEqual(
      USER_ASYNC_KEYS.filter((k) => sys.has(k)),
      [],
      'user AsyncStorage keys must not contain protected keys'
    );
    assertEqual(
      PROTECTED_ASYNC_KEYS.filter((k) => user.has(k)),
      [],
      'protected AsyncStorage keys must not appear in the user list'
    );
    assert(true, 'user scope is fully disjoint from system scope');
  });

  suite.test('user data tables never include flow system tables', () => {
    const protectedSet = new Set(PROTECTED_TABLES);
    assertEqual(
      USER_DATA_TABLES.filter((t) => protectedSet.has(t)),
      [],
      'flow_keywords and flow_liked are protected and must never be cleaned'
    );
  });

  suite.test('cleaner subsets stay inside the user whitelist', () => {
    const user = new Set(USER_DATA_TABLES);
    for (const t of [...CACHE_ONLY_TABLES, ...RECORDS_TABLES]) {
      assert(user.has(t), `cleaner targets '${t}' which is NOT in the user whitelist`);
    }
  });

  suite.test('critical system keys remain protected by constant', () => {
    for (const key of ['chatgpt:serverUrl', 'chatgpt:serverUser', 'chatgpt:serverPass', 'chatgpt:voice:keys:tts', 'chatgpt:modelID']) {
      assert(PROTECTED_ASYNC_KEYS.includes(key), `missing protection for '${key}'`);
    }
    assert(!USER_ASYNC_KEYS.includes('osamah:taskType'), 'taskType hint must stay out of the user scope');
  });

  suite.test('isCleanSurfaceSafe reports safe by default', () => {
    assert(isCleanSurfaceSafe(), 'boundary must start safe');
  });

  suite.test('bytesLabel formats real units', () => {
    assertEqual(bytesLabel(0), '0 B', 'zero');
    assertEqual(bytesLabel(1023), '1023 B', 'bytes');
    assertEqual(bytesLabel(1024), '1.0 KB', 'kib');
    assertEqual(bytesLabel(5 * 1024 * 1024), '5.0 MB', 'mebi');
    assertEqual(bytesLabel(2 * 1024 * 1024 * 1024), '2.00 GB', 'gibi');
  });

  suite.test('assembly zero-fills missing categories and sums totals', () => {
    const b = assembleBreakdown({ knowledge: { bytes: 500, count: 3 }, cache: { bytes: 1500, count: 8 } });
    assertEqual(b.totalBytes, 2000, 'total sums available categories only');
    assertEqual(b.cacheFileCount, 8, 'cache file count');
    assertEqual(b.categories.length, ALL_CATEGORIES.length, 'all categories rendered');
    for (const c of b.categories) {
      assert(c.bytes >= 0 && c.count >= 0, `negative value for ${c.id}`);
    }
  });

  suite.test('freedBytes only counts targeted categories and never negative', () => {
    const before = assembleBreakdown({ knowledge: { bytes: 1000, count: 5 }, records: { bytes: 200, count: 4 } });
    const after = assembleBreakdown({ knowledge: { bytes: 100, count: 0 }, records: { bytes: 200, count: 4 } });
    assertEqual(freedBytes(before, after, ['knowledge', 'records']), 900, 'targeted delta');
    assertEqual(freedBytes(before, after, ['videos']), 0, 'untouched category frees nothing');
  });

  suite.test('protected tables list contains the feed system tables', () => {
    assert(PROTECTED_TABLES.includes('flow_keywords'), 'flow_keywords protected');
    assert(PROTECTED_TABLES.includes('flow_liked'), 'flow_liked protected');
  });

  await suite.report();
}