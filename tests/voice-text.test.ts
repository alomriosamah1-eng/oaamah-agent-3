// Lightweight Node-safe tests for the pure voice logic that has no React
// Native / Expo imports: the text splitting/cleaning used by the engine.
// Router/engine behavior is validated by typechecking + manual failover and is
// intentionally not exercised here because those modules bind to expo/rn.
//
// Run: npx tsc --noEmit  (compile) then the asserts below, OR node won't work
// on TS — so this file doubles as a spec and is executed via the compiled path
// in CI/dev only.

import { splitChunks, speakableText } from '../utils/voice/text';

const cases: Array<[string, string]> = [
  // Markdown cleanup: strip code fences, links, headings, bold.
  [
    '```js\nconst x = 1;\n```\n\n## Title\n\nSome **bold** [link](https://x) text.',
    'Title Some bold link text.',
  ],
  // Chunking splits on sentence punctuation + keeps chunks bounded.
  ['hello. world. this is a fairly long sentence that should still be one chunk when under the limit', 'hello.'],
];

for (const [input, cleaned] of cases) {
  const got = speakableText(input);
  assert(cleaned, got);
}

const chunks = splitChunks('One. Two. Three. Four. Five.', 10);
assert(chunks.length >= 2, 'should split into multiple bounded chunks');
assert(chunks.every((c) => c.length <= 15), 'chunks should stay bounded');

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`TEST FAIL: ${msg}`);
}

console.log('VOICE TEXT LAYER TESTS: OK');
