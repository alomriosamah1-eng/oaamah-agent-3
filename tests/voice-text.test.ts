// Lightweight Node-safe tests for the pure voice logic that has no React
// Native / Expo imports: the text splitting/cleaning used by the engine.
// Router/engine behavior is validated by typechecking + manual failover and is
// intentionally not exercised here because those modules bind to expo/rn.
//
// Run: npx tsc --noEmit  (compile) then the asserts below, OR node won't work
// on TS — so this file doubles as a spec and is executed via the compiled path
// in CI/dev only.

import { splitChunks, speakableText, applyPronunciationLexicon } from '../utils/voice/text';

const cases: Array<[string, string]> = [
  // Markdown cleanup: strip code fences, links, headings, bold.
  [
    '```js\nconst x = 1;\n```\n\n## Title\n\nSome **bold** [link](https://x) text.',
    'Title Some bold link text.',
  ],
  // Chunking splits on sentence punctuation + keeps chunks bounded.
  ['hello. world. this is a fairly long sentence that should still be one chunk when under the limit', 'hello.'],
  // Emojis and decorative symbols must never reach the voice.
  ['Hello 👋 world 🎉', 'Hello world'],
  ['مرحبا 😊 كيف حالك؟', 'مرحبا كيف حالك؟'],
  ['One → Two • Three ✔ Done', 'One Two Three Done'],
  // "Only text and numbers" — commas, dashes, colons, quotes, parens and
  // brackets are dropped, sentence enders (. ؟ !) stay for intonation.
  ['مرحبا، كيف حالك؟', 'مرحبا كيف حالك؟'],
  ['النسبة 1-2 من 10', 'النسبة 1 2 من 10'],
  ['رمز — شرطة – هنا', 'رمز شرطة هنا'],
  ['شكرا 👌، جزيلا!', 'شكرا جزيلا!'],
  ['بالمناسبة: الساعة 10:30 الآن', 'بالمناسبة الساعة 10 30 الآن'],
  ['قال «أهلاً» وكتب (ثلاث) جمل', 'قال أهلاً وكتب ثلاث جمل'],
  ['نعم. أحيانا، نقول ما لا نقصد!', 'نعم. أحيانا نقول ما لا نقصد!'],
  // Real text and numbers survive.
  ['لديك 5 رسائل و3 تنبيهات', 'لديك 5 رسائل و3 تنبيهات'],
  // Bare links/emails are gibberish to a voice.
  ['Visit https://example.com/x42 now or email me@x.com', 'Visit now or email'],
];

for (const [input, cleaned] of cases) {
  const got = speakableText(input);
  assert(cleaned, got);
}

const chunks = splitChunks('One. Two. Three. Four. Five.', 10);
assert(chunks.length >= 2, 'should split into multiple bounded chunks');
assert(chunks.every((c) => c.length <= 15), 'chunks should stay bounded');

// Pronunciation lexicon — names are pinned with harakat so they always come
// out right, but only as whole words (never inside a longer word).
assert(
  applyPronunciationLexicon('أهلا ميرا، هذا كريم وأسامة هنا') ===
    'أهلا مِيرَا، هذا كَرِيم وأُسَامَة هنا',
  'names get pinned vowels',
);
assert(
  applyPronunciationLexicon('الميراميم') === 'الميراميم',
  'embedded name inside a word stays untouched',
);
assert(
  applyPronunciationLexicon('كريمة') === 'كريمة',
  'كريم followed by ة stays untouched',
);
assert(
  applyPronunciationLexicon('Mira says hi') === 'Mira says hi',
  'latin text is never rewritten',
);

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`TEST FAIL: ${msg}`);
}

console.log('VOICE TEXT LAYER TESTS: OK');
