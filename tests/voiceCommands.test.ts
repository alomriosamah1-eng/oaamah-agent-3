// Spoken voice-command parser tests — pure, Node-safe. The parser decides
// whether a transcribed utterance is a voice switch request, so its matches /
// non-matches must be exact (a normal message must NEVER trigger a switch).
//
// Run: npx tsc --noEmit  then node on the compiled .test-dist/tests output.

import { parseVoiceCommand } from '../utils/voice/commands';

function check(
  text: string,
  expect: { gender?: string; locale?: string; persona?: string } | null,
  label: string,
) {
  const got = parseVoiceCommand(text);
  const gotJson = got === null ? null : { gender: got.gender, locale: got.locale, persona: got.persona };
  const expectJson = expect === null
    ? null
    : { gender: expect.gender, locale: expect.locale, persona: expect.persona };
  if (JSON.stringify(gotJson) !== JSON.stringify(expectJson)) {
    throw new Error(`TEST FAIL: ${label}\n  in:  ${text}\n  want ${JSON.stringify(expectJson)}\n  got  ${JSON.stringify(gotJson)}`);
  }
}

// Gender switches.
check('بدّل صوتك إلى ذكر', { gender: 'male' }, 'switch to male');
check('غيّر الصوت لصوت رجل', { gender: 'male' }, 'switch to male man');
check('استخدم الصوت الأنثى من فضلك', { gender: 'female' }, 'switch to female');
check('خلّي الصوت ميرا', { gender: 'female', persona: 'mira' }, 'switch to Mira persona female');
check('بدّلني لصوت كريم', { gender: 'male', persona: 'karim' }, 'switch to Kareem persona male');
check('use the male voice please', { gender: 'male' }, 'english male');
check('make your voice female', { gender: 'female' }, 'english female');

// Character personas — naming the companion switches voice AND persona.
check('ميرا', { gender: 'female', persona: 'mira' }, 'bare name Mira -> female persona');
check('كريم', { gender: 'male', persona: 'karim' }, 'bare name Kareem -> male persona');
check('أهلاً ميرا', { gender: 'female', persona: 'mira' }, 'short address naming Mira');
check('ناديني ميرا من فضلك', { gender: 'female', persona: 'mira' }, 'call-me Mira');
check('تحدث باسم كريم', { gender: 'male', persona: 'karim' }, 'speak as Kareem');

// Dialect switches.
check('خلي الصوت سوري', { locale: 'ar-SY' }, 'switch to syrian');
check('غير الصوت إلى فصحى', { locale: 'ar-SA' }, 'switch to fusha');
check('استعمل لهجة شامية', { locale: 'ar-SY' }, 'switch to shami');
check('switch to MSA', { locale: 'ar-SA' }, 'english msa');
check('change your dialect to syrian', { locale: 'ar-SY' }, 'english syrian');

// Both at once.
check('بدّل صوتك لذكر وبلهجة فصحى', { gender: 'male', locale: 'ar-SA' }, 'male + fusha');
check('استخدم صوت أنثى سورية', { gender: 'female', locale: 'ar-SY' }, 'female + syrian');

// Normal conversation must be left alone — mentioning the name in a longer
// sentence or greeting a person named Mira is NOT a persona switch.
check('اذكر لي فوائد الرياضة', null, 'no intent, no target');
check('تذكر موعدنا غداً من فضلك', null, 'embedded ذكر is not a boundary match');
check('ما رأيك بامرأة كريمة؟', null, 'describes someone — no switch intent');
check('ميرا مدينة جميلة', null, 'city mention — no switch intent');
check('كيف حالك يا ميرا؟', null, 'greeting a person named Mira — no switch');
check('شرحت لك الفصاحة عند العرب', null, 'wordplay — no voice reference');
check('كيف حالك اليوم؟', null, 'plain greeting');
check('', null, 'empty');

console.log('VOICE COMMANDS TESTS: OK');