// Text helpers shared by the engine and providers — cleaning agent Markdown
// into speakable prose and splitting long replies into bounded utterance
// chunks. Ported verbatim from the retired voice server client (the cleanup
// behaviour is preserved; only the transport changed).

/** Symbols and pictographs no TTS should ever read aloud (emoji, arrows,
 *  math/box-drawing/geometric decorations, variation selectors, ZWJ…). */
function isSymbolJunk(cp: number): boolean {
  return (
    (cp >= 0x2190 && cp <= 0x2bff) || // arrows → dingbats band
    cp === 0x200d || // zero-width joiner
    cp === 0x2022 || // bullet •
    (cp >= 0xfe00 && cp <= 0xfe0f) || // emoji variation selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) || // combining half marks
    (cp >= 0x1f000 && cp <= 0x1faff) || // emoji blocks
    cp === 0x00a9 || cp === 0x00ae || cp === 0x2122 // © ® ™
  );
}

/**
 * Characters no voice should ever utter — "plain words and numbers only".
 * Commas, dashes, colons, quotes, parentheses, brackets, tatweel… are dropped
 * BEFORE synthesis so a TTS can never voice them. Sentence enders (. ? ! ؟)
 * are deliberately kept — they steer intonation and are never spoken.
 */
const SPOKEN_NOISE = /[,\u060C؛;\u061B:«»“”"()\[\]{}–—\-]/g;

/** Clean assistant Markdown into something a TTS engine can read aloud. */
export function speakableText(md: string): string {
  const cleaned = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_`>|#~]/g, ' ')
    // Bare links and emails read as gibberish — drop them whole.
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+/gi, ' ')
    // Only text and numbers reach the voice: no commas, dashes, quotes or
    // decorative punctuation may ever be spoken.
    .replace(SPOKEN_NOISE, ' ');
  // Strip emojis and decorative symbols so only real text and numbers reach
  // the voice. Iterate by code point so surrogate-pair emoji are caught as
  // whole units, and replace them with a space (never join two words).
  let out = '';
  for (const ch of cleaned) {
    const cp = ch.codePointAt(0) ?? 0;
    out += isSymbolJunk(cp) ? ' ' : ch;
  }
  return out.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Split text into speakable chunks so the first chunk can start while later
 * ones are still being synthesized. Being aggressive here never hurts a cloud
 * provider (it simply receives a few audio files instead of one) and it keeps
 * the platform TTS from choking on long strings.
 */
export function splitChunks(text: string, maxLen = 220): string[] {
  const clean = speakableText(text);
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!؟؟…])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (!part.trim()) continue;
    if (current && current.length + part.length + 1 > maxLen) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = current ? `${current} ${part}` : part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * Deterministic pronunciation overrides — names and words a neural voice (or
 * the diacritizer) might otherwise read ambiguously, pinned to their correct
 * orthography with explicit vowels (tashkeel). Applied to every spoken beat
 * AFTER markdown stripping and BEFORE any provider, gateway or fallback.
 * Must stay conservative: whole-word matches only (Arabic letters + digits,
 * punctuation ignored), with leading proclitics (و/ف/ب/ل/ال) allowed — but a
 * derivational prefix like ت/ي («تكريم») never counts as a boundary.
 */
const PRONUNCIATION_LEXICON: Array<[string, string]> = [
  ['ميرا', 'مِيرَا'],
  ['كريم', 'كَرِيم'],
  ['أسامة', 'أُسَامَة'],
];

/** Arabic letters, Arabic-Indic digits, Latin letters/digits (no punctuation). */
const LETTERS = '\\u0621-\\u064A\\u0671-\\u06D3\\u0660-\\u0669a-zA-Z0-9';
/** Particles that glue onto a name (و/ف/ب/ل + definite article) — kept. */
const PROCLITIC = '(?:[ولبف]+)?(?:ال)?';

/** Apply the pinned pronunciations, whole-word + proclitic safe. */
export function applyPronunciationLexicon(text: string): string {
  let out = text;
  for (const [word, pronounced] of PRONUNCIATION_LEXICON) {
    // (1) boundary char (space/punct/start, preserved), (2) proclitic
    // (preserved), then the exact word — so neither the gap nor و/ب/ال vanish.
    const pattern = new RegExp(`(?:^|([^${LETTERS}]))(${PROCLITIC})${word}(?=$|[^${LETTERS}])`, 'g');
    out = out.replace(pattern, (_m, boundary: string | undefined, pro: string) => {
      return `${boundary ?? ''}${pro}${pronounced}`;
    });
  }
  return out;
}