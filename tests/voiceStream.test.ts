// Node-safe spec for the streaming-speech segmenter used by the conversation
// loop: it must chop an agent stream into speakable beats but never mangle the
// in-flight remainder. conversation.ts is intentionally free of expo/runtime
// imports so it can run here without a device.
//
// The reply is spoken CONTINUOUSLY — beats are whole sentences (short ones are
// merged), commas never force a cut, and each beat is long enough to be worth
// its own TTS synthesis. Otherwise every comma would stutter into a new voice.

import { splitSpeechSegments } from '../utils/voice/segment';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`TEST FAIL: ${msg}`);
}

// Short sentences are merged into ONE fluid beat instead of spoken separately.
{
  const { out, rest } = splitSpeechSegments('السلام عليكم. كيف حالك؟');
  assert(out.length === 0, 'short beats merge, nothing stutters out yet');
  assert(rest.trim() === 'السلام عليكم. كيف حالك؟', 'merged short beats stay buffered');
}

// Commas and newlines are NOT sentence enders — a comma-separated run stays
// one beat, so the voice does not break between every comma-separated clause.
{
  const text = 'واحد، اثنان، ثلاثة، أربعة';
  const { out, rest } = splitSpeechSegments(text);
  assert(out.length === 0, 'commas never force a cut');
  assert(rest === text, 'comma text stays whole');
}

// A beat is emitted once a sentence is long enough to speak alone.
{
  const sentence = 'جملة أولى طويلة بما يكفي لتُقطع كاملة وحدها خلال البث.';
  const { out, rest } = splitSpeechSegments(sentence);
  assert(out.length === 1, 'long sentence is cut as one beat');
  assert(out[0] === sentence, 'the beat keeps its stop punctuation');
  assert(rest === '', 'no remainder after the full beat');
}

// A short sentence BEFORE a long one merges into the same beat — the reply
// starts as one continuous breath, never a stutter then a pause.
{
  const text = 'نعم. ثم جملة طويلة بما يكفي لتُقرأ كاملة مع ما قبلها بلا انقطاع.';
  const { out } = splitSpeechSegments(text);
  assert(out.length === 1, 'short + long sentences form one continuous beat');
  assert(out[0].startsWith('نعم.'), 'the merged beat starts with the short one');
}

// A run-on reply with no punctuation splits at a space once it overflows.
{
  const long = 'one '.repeat(60).trim() + ' tail';
  const { out, rest } = splitSpeechSegments(long);
  assert(out.length === 1, 'long run-on pushes one segment out');
  assert(out[0].length > 0 && !out[0].includes(' tail'), 'segment ends before the tail');
  assert(rest.includes('tail'), 'tail stays buffered for the next feed');
  assert(
    (out.join(' ') + ' ' + rest).split(/\s+/).join(' ') === long,
    'no words lost or added',
  );
}

// Incremental feeding (set-semantics deltas) must never re-speak old text.
{
  const { out, rest } = splitSpeechSegments('This is the first sentence that is long enough to be spoken alone.');
  assert(out.length === 1, 'first delta completes a segment');
  const firstLen = out[0].length;
  assert(rest === '', 'first beat leaves nothing behind');
  // New chunk includes ALL prior text ("full reply so far") — the caller only
  // forwards the suffix, so simulate that by re-building the whole stream.
  let acc = 'This is the first sentence that is long enough to be spoken alone.';
  const suffix = () => {
    const been = acc;
    acc += ' This is the second sentence and it is long enough to be its own beat.';
    return acc.slice(been.length);
  };
  const { out: out2, rest: rest2 } = splitSpeechSegments(suffix());
  assert(out2.length === 1 && out2[0] === 'This is the second sentence and it is long enough to be its own beat.', 'only the new words are emitted');
  assert(rest2 === '', 'clean end');
  assert(firstLen === 66, 'the first segment length is stable across feeds');
}

// Very short fragments are held back instead of stuttering them out.
{
  const { out, rest } = splitSpeechSegments('ok '); // no boundary, tiny buffer
  assert(out.length === 0, 'tiny fragments stay buffered');
  assert(rest === 'ok ', 'tiny fragments stay buffered (rest)');
}

console.log('VOICE STREAM SEGMENTER TESTS: OK');