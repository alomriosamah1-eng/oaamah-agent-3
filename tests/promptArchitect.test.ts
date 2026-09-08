// Prompt Maker — pure module tests: pipeline, output-only guard, smart titles,
// the agent itself, and the isolated history record helpers. No RN/Expo
// imports — runs fully under Node.

import { PromptMakerAgent } from '../prompt-maker/agent/PromptMakerAgent';
import {
  assessQuality,
  buildInstructionPrompt,
  extractIntentLang,
  makeTitle,
  sanitizeOutput,
} from '../prompt-maker/agent/prompt-engine';
import {
  draftFromOutput,
  makeRecord,
  previewOf,
  recordToOutput,
  sortByNewest,
} from '../prompt-maker/services/history-core';
import { listPromptSkills, pickSkill, skillForInput } from '../prompt-maker/skills/prompt-skill-adapter';
import type { LlmFn, PromptMakerOutput } from '../prompt-maker/types/prompt-types';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('promptArchitect');

/* ------------------------------------------------------------------ */
/* Skill adapter (reads the project's own prompt-engineering skill)     */
/* ------------------------------------------------------------------ */

test('skill adapter: 8 skills available, routing works', () => {
  assert(listPromptSkills().length === 8, '8 skills in library');
  assertEqual(pickSkill('coding').id, 'coding');
  assert(pickSkill('coding').rules.length > 0, 'coding skill has rules');
  assertEqual(skillForInput('build a react native api function').id, 'coding');
  assertEqual(skillForInput('اكتب مقالاً عن الذكاء الاصطناعي').id, 'writing');
});

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

test('extractIntentLang: language + intent + skill', () => {
  const en = extractIntentLang('create a react native app that calls an api');
  assertEqual(en.lang, 'en');
  assertEqual(en.intent, 'coding');
  assertEqual(en.skill.id, 'coding');
  const ar = extractIntentLang('بحث أكاديمي حول الطاقة المتجددة بمراجع');
  assertEqual(ar.lang, 'ar');
  assertEqual(ar.intent, 'research');
  const forced = extractIntentLang('hello', 'ar', 'creative');
  assertEqual(forced.lang, 'ar');
  assertEqual(forced.intent, 'creative');
});

test('instruction prompt embeds skill rules and output-only rule', () => {
  const sys = buildInstructionPrompt(pickSkill('coding'), 'en');
  assert(sys.includes('Coding Prompt'), 'skill name present');
  assert(sys.toLowerCase().includes('tech stack'), 'rules embedded');
  assert(/Output ONLY/i.test(sys) || /أخرج البرومبت النهائي فقط/.test(sys), 'output-only rule');
  const ar = buildInstructionPrompt(pickSkill('writing'), 'ar');
  assert(/أنت متخصص في هندسة البرومبتات/.test(ar), 'arabic persona');
});

test('instruction prompt adapts to the request domain, never defaults to coding', () => {
  const sys = buildInstructionPrompt(pickSkill('writing'), 'en');
  assert(/never default it to coding/i.test(sys), 'no coding default (en)');
  const ar = buildInstructionPrompt(pickSkill('creative'), 'ar');
  assert(/لا تخصّصه للبرمجة افتراضيًا/.test(ar), 'no coding default (ar)');
});

test('agent forwards onPartial streaming progress', async () => {
  let seen = 0;
  const agent = new PromptMakerAgent(async (req) => {
    if (req.onPartial) {
      req.onPartial('```prompt\n# Role\nDraft');
      req.onPartial('```prompt\n# Role\nDraft plus');
    }
    return '```prompt\n# Role\nAct as a copywriter for a fashion brand.\n```';
  });
  const out = await agent.generate('اكتب برومبتاً لكاتب إعلانات لماركة أزياء', {
    lang: 'ar',
    onPartial: () => {
      seen += 1;
    },
  });
  assertEqual(seen, 2, 'partial forwarded twice');
  assert(!out.prompt.includes('```'), 'final clean');
  assertEqual(out.intent, 'writing');
});

test('sanitizeOutput: strips fences and conversational lead-in', () => {
  const fenced = '```prompt\nAct as an expert. Build a tool.\n```';
  assertEqual(sanitizeOutput(fenced), 'Act as an expert. Build a tool.');

  const lead = 'Here is your prompt:\n\n# Role\nYou are an expert.';
  const cleaned = sanitizeOutput(lead);
  assertEqual(cleaned, '# Role\nYou are an expert.');

  const arLead = 'إليك البرومبت:\n\nأنت خبير تقني لتحليل مشاريع React.';
  assertEqual(sanitizeOutput(arLead), 'أنت خبير تقني لتحليل مشاريع React.');

  const tail = '# Role\nBuild the thing.\n\nGood luck!';
  assertEqual(sanitizeOutput(tail), '# Role\nBuild the thing.');

  const plain = '# Role\nBuild a tool with no preamble at all.';
  assertEqual(sanitizeOutput(plain), plain);
});

test('assessQuality: strong prompt scores 100', () => {
  const strong =
    'Act as an expert engineer. Please build a tool for this project stack.\n' +
    'Constraints: must not add external dependencies. Input: user text.\n' +
    'Return the output in JSON format. Example: {"ok":true}.\n' +
    'Handle invalid input and empty edge cases. Success criteria: PASS all tests.';
  assertEqual(assessQuality(strong).score, 100);
  const weak = 'hello';
  assert(assessQuality(weak).score < 100, 'weak prompt lower score');
});

/* ------------------------------------------------------------------ */
/* Smart titles                                                        */
/* ------------------------------------------------------------------ */

test('makeTitle: English drops lead-in and stop words', () => {
  assertEqual(
    makeTitle('I need a prompt that makes the LLM behave as a React project analysis agent', 'coding', 'en'),
    'React Project Analysis Agent',
  );
  assertEqual(makeTitle('build me a function that parses json', 'coding', 'en'), 'Function Parses Json');
});

test('makeTitle: Arabic trims verbs and keeps concise phrasing', () => {
  const ar = makeTitle('برومبت اعتبرني مستخدم غير متمكن تقنيًا لتحليل مشروع React', 'analysis', 'ar');
  assert(ar.length > 0 && ar.length <= 40, 'short arabic title');
  assert(!ar.includes('اعتبرني'), 'verbs dropped');
  const fallback = makeTitle('أريد برومبتاً لكتابة مقال قصير', 'writing', 'ar');
  assert(fallback.length > 0, 'fallback non-empty');
});

/* ------------------------------------------------------------------ */
/* PromptMakerAgent (injectable LLM)                                    */
/* ------------------------------------------------------------------ */

function fakeLlm(reply: string): LlmFn {
  return async () => reply;
}

function buildable(): PromptMakerOutput {
  return {
    prompt: 'Act as a senior React native developer. Build a component for this stack.',
    title: 'React Component',
    intent: 'coding',
    skillId: 'coding',
    lang: 'en',
    quality: { score: 100, passed: [], missing: [] },
  };
}

test('agent.generate: sanitizes reply → prompt-only output', async () => {
  const agent = new PromptMakerAgent(
    fakeLlm('```prompt\nAct as a senior engineer. Build an api client for the project stack.\n```'),
  );
  const out = await agent.generate('build an api client for react native');
  assert(!out.prompt.includes('```'), 'no fences leaked');
  assert(out.prompt.startsWith('Act as a senior engineer'), 'gets the prompt only');
  assertEqual(out.intent, 'coding');
  assertEqual(out.skillId, 'coding');
  assert(out.title.length > 0, 'title generated');
});

test('agent.generate: strips preamble so output is ONLY the prompt', async () => {
  const agent = new PromptMakerAgent(
    fakeLlm('بالطبع! إليك البرومبت:\n\n# الدور\nأنت مهندس واجهات خبير.\n\nبالتوفيق'),
  );
  const out = await agent.generate('برومبت لأن أنشئ واجهة React', { lang: 'ar' });
  assertEqual(out.prompt, '# الدور\nأنت مهندس واجهات خبير.');
  assertEqual(out.lang, 'ar');
});

test('agent.transform: improve keeps single-prompt contract', async () => {
  const agent = new PromptMakerAgent(fakeLlm('# Role\nImproved prompt text only.'));
  const out = await agent.transform('build api client', 'Act as expert.', 'improve');
  assertEqual(out.prompt, '# Role\nImproved prompt text only.');
  assert(out.title.length > 0, 'title kept');
});

test('agent.analyze: returns local quality verdicts', async () => {
  const agent = new PromptMakerAgent(fakeLlm('short report'));
  const probe = 'Act as an expert engineer. Please build a tool for this project stack. Return the output in JSON format. Constraints: must not add external dependencies.';
  const a = await agent.analyze(probe);
  assertEqual(a.score, assessQuality(probe).score);
  assertEqual(a.summary, 'short report');
  assert(a.strengths.length + a.weaknesses.length === 10, 'all dimensions accounted');
});

/* ------------------------------------------------------------------ */
/* History records                                                     */
/* ------------------------------------------------------------------ */

test('history-core: draft → record → newest sort → preview', () => {
  const draft = draftFromOutput(buildable(), 'build react component');
  assertEqual(draft.title, 'React Component');
  const rec = makeRecord(draft, 1000, 1);
  assertEqual(rec.id, 1);
  assertEqual(rec.createdAt, 1000);
  const rec2 = makeRecord(draft, 2000, 2);
  const sorted = sortByNewest([rec, rec2]);
  assertEqual(sorted[0].id, 2);

  const preview = previewOf(buildable().prompt);
  assert(preview.length <= 141, 'preview capped');
  assert(preview.startsWith('Act as a senior React'), 'preview starts with prompt');

  const out = recordToOutput(rec);
  assertEqual(out.title, 'React Component');
  assertEqual(out.lang, 'en');
  assert('quality' in out, 'quality re-derived');
});

report();