// Strict JSON extraction used across the agent flows.
import { extractJson } from '../utils/jsonExtract';
import { assert, assertEqual, assertThrows, makeSuite } from './helpers';

const { test, report } = makeSuite('jsonExtract');

test('extractJson: fenced JSON', () => {
  const out = extractJson<{ a: number }>('```json\n{"a": 1}\n```');
  assertEqual(out, { a: 1 });
});

test('extractJson: JSON inside prose', () => {
  const out = extractJson<{ b: string }>('sure, here is the result {"b": "x"} done.');
  assertEqual(out, { b: 'x' });
});

test('extractJson: plain JSON with extra braces inside strings', () => {
  const out = extractJson<{ s: string }>('{"s": "use {braces} here"}');
  assertEqual(out, { s: 'use {braces} here' });
});

test('extractJson: throws when no object present', () => {
  assertThrows(() => extractJson('no json here at all'), 'no braces');
  assertThrows(() => extractJson('hello [1,2,3]'), 'only array');
});

test('extractJson: throws on malformed JSON', () => {
  assertThrows(() => extractJson('{"broken": }'), 'invalid object');
});

test('extractJson: nested + array payloads survive', () => {
  const out = extractJson<{ items: Array<{ id: number }> }>(
    '{"items": [{"id": 1}, {"id": 2}]}',
  );
  assert(out.items.length === 2, 'two items');
  assertEqual(out.items[1], { id: 2 });
});

export const runSuite = report;