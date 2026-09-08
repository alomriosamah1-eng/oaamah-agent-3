// Spoken voice commands — the user can ask the agent, mid-conversation, to
// switch the talking voice's gender (female/male) and dialect (Syrian
// colloquial vs Modern Standard Arabic "فصحى") by just saying it, and to
// BECOME a character — «ميرا» (female voice) or «كريم» (male voice) — simply
// by naming them. The result is fed to `updateConfig` and a short spoken
// confirmation is returned; the request never reaches the model as a normal
// turn.
//
// Pure module (no React/Expo imports) so it is unit-testable in Node.

import type { VoiceGender, VoiceLocale } from './config';
import type { PersonaId } from './persona';

export interface VoiceCommand {
  gender?: VoiceGender;
  locale?: VoiceLocale;
  persona?: PersonaId;
}

/**
 * \b is ASCII-based, so it never fires around Arabic letters. Build an
 * explicit word boundary from the letters/digits that actually make up words
 * (Arabic + Latin + digits) — Arabic punctuation (،؟…) never counts as a
 * word char, so "ذكر" matches "صوتك ذكر،" but not "تذكر".
 */
const WORD_CHARS = '\\u0621-\\u064A\\u0671-\\u06D3\\u0660-\\u0669A-Za-z0-9_';
const boundary = (token: string) => `(?:^|[^${WORD_CHARS}])${token}(?=$|[^${WORD_CHARS}])`;
/**
 * Arabic proclitics glue onto the word: particles (و/ل/ب/ف: "وذكر", "لذكر",
 * "بالذكر") and the article («ال»). Verb prefixes (ت/ي/ا/ن: "تذكر", "يذكر")
 * are deliberately NOT allowed so real words don't trigger a switch.
 */
const pre = (token: string) => `(?:[ولبف]+)?(?:ال)?${token}`;

/** Anything that marks the utterance as a voice-switch request. */
const INTENT_RE =
  /بدّل|بدل|بدلي|غيّر|غير|غيّري|غيّريها|حوّل|حول|استخدم|استعمل|اجعل|خلّي|خلي|عطني|عطّني|نادِ|نادين|نادني|ناديني|سمّيني|سميني|باسم|become|change|switch|use|make|set|give/i;

/** The utterance talks about the voice itself (with or without a verb). */
const VOICE_REF_RE = /صوت|voice/i;

const MALE_RE = new RegExp(
  [
    boundary(pre('ذكر')),
    boundary(pre('رجُل')),
    boundary(pre('رجل')),
    boundary(pre('رجال')),
    boundary(pre('ذَكَر')),
    boundary(pre('ذكور')),
    'كريم',
    boundary('male'),
  ].join('|'),
  'i',
);

const FEMALE_RE = new RegExp(
  [
    boundary(pre('أنثى')),
    boundary(pre('انثى')),
    boundary(pre('أنثي')),
    boundary(pre('امرأة')),
    boundary(pre('امراه')),
    boundary(pre('بنت')),
    boundary(pre('نسائي')),
    'ميرا',
    boundary('female'),
    boundary('woman'),
    boundary('girl'),
  ].join('|'),
  'i',
);

const FUSHA_RE =
  /فصحى|فصحىٰ|فُصحى|فصيحة|فصيح|fusha|fosha|msa|modern standard|standard arabic|classical/i;

const SYRIAN_RE =
  /سورية|سوريّة|سوريّ|سوريا|شامي|شاميّ|شامية|شاميّة|عامية|عاميّة|سوري|syrian|shami|damascene/i;

/** The character names as whole, exact words (proclitic-safe, never inside a
 *  longer word — «كريمة» or «تكريم» never name the persona). */
const MIRA_NAME_RE = new RegExp(
  boundary(pre('ميرا')),
  'i',
);
const KARIM_NAME_RE = new RegExp(
  boundary(pre('كريم')),
  'i',
);

/**
 * Detect a character persona switch («ميرا» female / «كريم» male). A name
 * ALONE is enough when the utterance is short ("ميرا"), or when it arrives
 * with a request marker (voice words, switch verbs). A longer sentence that
 * merely mentions the name ("ميرا مدينة جميلة") is left alone.
 */
function detectPersona(text: string): PersonaId | undefined {
  const lower = text.toLowerCase();
  const gate =
    INTENT_RE.test(lower) ||
    VOICE_REF_RE.test(lower) ||
    text.trim().split(/\s+/).filter(Boolean).length <= 2;
  if (!gate) return undefined;
  if (MIRA_NAME_RE.test(text)) return 'mira';
  if (KARIM_NAME_RE.test(text)) return 'karim';
  return undefined;
}

/**
 * Detect a voice switch request in a (transcribed) utterance. Requires a
 * request signal (a switch verb, an explicit mention of the voice, or a
 * character name used as a persona switch) and at least one target: a gender,
 * a dialect, or a persona. Returns the configuration patch, or null when the
 * utterance is a normal message.
 */
export function parseVoiceCommand(text: string): VoiceCommand | null {
  const lower = text.toLowerCase();
  const referencesVoice = VOICE_REF_RE.test(lower);
  const intent = INTENT_RE.test(lower);
  const persona = detectPersona(text);
  if (!intent && !referencesVoice && !persona) return null;

  const patch: VoiceCommand = {};
  if (persona) patch.persona = persona;

  // Check female first — "female" contains the substring "male".
  if (FEMALE_RE.test(lower)) patch.gender = 'female';
  else if (MALE_RE.test(lower)) patch.gender = 'male';
  else if (persona) patch.gender = persona === 'mira' ? 'female' : 'male';

  if (FUSHA_RE.test(lower)) patch.locale = 'ar-SA';
  else if (SYRIAN_RE.test(lower)) patch.locale = 'ar-SY';

  return patch.gender || patch.locale || patch.persona ? patch : null;
}