// Prompt Maker — Prompt Engineering Assistant
//
// Encodes the distilled patterns from the open-source Prompt-Engineering skill
// ecosystem (k-vaca/prompt-engineering-skill, unkownpr/prompt-engineering-skill,
// PhAlves23/prompt-engineering-skill, ckelsoe/prompt-architect) into a compact
// on-device skill router + quality validator. The LLM call is injectable so the
// pure logic is testable without a network.
//
// The pure intent-router / skill-library / quality-validator live in
// utils/promptModel.ts (Node-testable); this module keeps the LLM-calling
// functions and re-exports the moved pieces so existing imports stay valid.

import { chatComplete, getSelectedZenModel } from '@/utils/OpenCodeAgent';
import {
  detectIntent,
  detectLang,
  getSkill,
  listSkills,
  validatePrompt,
  type PromptIntent,
  type PromptOperation,
  type PromptSkill,
} from '@/utils/promptModel';

export type {
  PromptIntent,
  PromptSkill,
  PromptOperation,
  QualityDimension,
} from '@/utils/promptModel';
export {
  detectIntent,
  detectLang,
  getSkill,
  listSkills,
  validatePrompt,
  INTENT_HINTS,
  INTENT_KEYS,
  QUALITY_DIMENSIONS,
} from '@/utils/promptModel';

export interface BuiltPrompt {
  prompt: string;
  intent: PromptIntent;
  skillId: string;
  quality: { score: number; passed: string[]; missing: string[] };
  lang: 'ar' | 'en';
}

export interface PromptAnalysis {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

/* ------------------------------------------------------------------ */
/* Skill library                                                       */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(skill: PromptSkill, lang: 'ar' | 'en'): string {
  const rules = skill.rules
    .map((r, i) => `${lang === 'ar' ? `${i + 1}.` : `${i + 1}.`} ${r}`)
    .join('\n');
  const anti = skill.antiPatterns
    .map((a, i) => `${lang === 'ar' ? `- تجنب:` : `- Avoid:`} ${a}`)
    .join('\n');
  if (lang === 'ar') {
    return `أنت متخصص في هندسة البرومبتات. ابنِ برومبتًا احترافيًا وفق القواعد التالية بدقة:

${rules}

نماذج ممنوعة:
${anti}

أخرج البرومبت النهائي فقط في كتلة markdown \`\`\`prompt ... \`\`\` — بدون مقدمات، بدون شرح، بدون خاتمة.`;
  }
  return `You are a prompt engineering specialist. Build a professional prompt following these rules precisely:

${rules}

Anti-patterns to avoid:
${anti}

Output ONLY the final prompt inside a markdown \`\`\`prompt ... \`\`\` block — no preamble, no explanation, no closing.`;
}

/* ------------------------------------------------------------------ */
/* Prompt construction (LLM call is injectable)                        */
/* ------------------------------------------------------------------ */

interface BuildOptions {
  lang?: 'ar' | 'en';
  intent?: PromptIntent;
  signal?: AbortSignal;
  llm?: typeof chatComplete;
}

const EXTRACT_BLOCK = /```(?:prompt|text|markdown)?\s*([\s\S]*?)```/i;

function stripFences(reply: string): string {
  const match = reply.match(EXTRACT_BLOCK);
  if (match && match[1].trim().length > 0) return match[1].trim();
  return reply.trim();
}

export async function buildPrompt(
  input: string,
  opts: BuildOptions = {},
): Promise<BuiltPrompt> {
  const lang = opts.lang ?? detectLang(input);
  const intent = opts.intent ?? detectIntent(input);
  const skill = getSkill(intent);
  const llm = opts.llm ?? chatComplete;

  const user =
    lang === 'ar'
      ? `طلب المستخدم لبناء برومبت:\n${input}\n\nابنِ البرومبت باللغة العربية.`
      : `User request for building a prompt:\n${input}\n\nBuild the prompt in English.`;

  const reply = await llm(
    {
      system: buildSystemPrompt(skill, lang),
      user,
      temperature: 0.5,
      maxTokens: 2400,
      model: opts.llm ? undefined : await getSelectedZenModel().catch(() => undefined),
    },
    opts.signal,
  );

  const prompt = stripFences(reply);
  const quality = validatePrompt(prompt);
  return { prompt, intent, skillId: skill.id, quality, lang };
}

/* ------------------------------------------------------------------ */
/* Transform operations: improve / shorten / expand / regenerate       */
/* ------------------------------------------------------------------ */

export async function transformPrompt(
  input: string,
  current: string,
  operation: PromptOperation,
  opts: BuildOptions = {},
): Promise<BuiltPrompt> {
  const lang = opts.lang ?? detectLang(input);
  const intent = opts.intent ?? detectIntent(input);
  const skill = getSkill(intent);
  const llm = opts.llm ?? chatComplete;

  const action: Record<PromptOperation, { ar: string; en: string }> = {
    regenerate: { ar: 'أعد بناء البرومبت من جديد بجودة أعلى.', en: 'Rebuild the prompt from scratch with higher quality.' },
    improve: {
      ar: 'حسّن البرومبت: أصلح نقاط الضعف، أضف التفاصيل المفقودة، اجعل الأهداف كمّية.',
      en: 'Improve the prompt: fix weaknesses, add missing detail, make goals quantitative.',
    },
    shorten: { ar: 'اختصر البرومبت لأقصر صيغة فعّالة دون فقدان المعنى.', en: 'Shorten the prompt to the most concise effective form without losing meaning.' },
    expand: { ar: 'وسّع البرومبت: أضف أمثلة، حالات حافة، ومعايير نجاح مفصلة.', en: 'Expand the prompt: add examples, edge cases, and detailed success criteria.' },
    analyze: { ar: 'حلّل البرومبت ضد معايير الجودة.', en: 'Analyze the prompt against quality criteria.' },
  };

  const user =
    lang === 'ar'
      ? `الطلب الأصلي: ${input}\n\nالبرومبت الحالي:\n${current}\n\n${action[operation].ar}\n${analyzeInstruction(skill, lang)}`
      : `Original request: ${input}\n\nCurrent prompt:\n${current}\n\n${action[operation].en}\n${analyzeInstruction(skill, lang)}`;

  const reply = await llm(
    { system: buildSystemPrompt(skill, lang), user, temperature: 0.5, maxTokens: 2400 },
    opts.signal,
  );

  const prompt = stripFences(reply);
  const quality = validatePrompt(prompt);
  return { prompt, intent, skillId: skill.id, quality, lang };
}

function analyzeInstruction(skill: PromptSkill, lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return `التزم بقواعد المهارة «${skill.name}»:${skill.rules.map((r) => `\n- ${r}`).join('')}`;
  }
  return `Follow the "${skill.name}" skill rules:${skill.rules.map((r) => `\n- ${r}`).join('')}`;
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

export async function analyzePrompt(
  prompt: string,
  opts: BuildOptions = {},
): Promise<PromptAnalysis> {
  const lang = opts.lang ?? detectLang(prompt);
  const llm = opts.llm ?? chatComplete;
  const quality = validatePrompt(prompt);

  const system =
    lang === 'ar'
      ? 'أنت خبير مراجعة برومبتات. وازن الإيجابيات والسلبيات واقترح تحسينات محددة. أعد تقريرًا موجزًا منسّقًا بقوائم قصيرة.'
      : 'You are a prompt review expert. Weigh strengths and weaknesses and suggest specific improvements. Return a concise report with short lists.';

  const user =
    lang === 'ar'
      ? `حلّل هذا البرومبت:\n\n${prompt}\n\nالمعايير المفقودة حالياً: ${quality.missing.join(', ') || 'لا شيء'}\n\nأخرج: ملخص، نقاط قوة، نقاط ضعف، 3-5 تحسينات قابلة للتطبيق.`
      : `Analyze this prompt:\n\n${prompt}\n\nCurrently missing: ${quality.missing.join(', ') || 'none'}\n\nOutput: summary, strengths, weaknesses, 3-5 actionable improvements.`;

  const reply = await llm(
    { system, user, temperature: 0.4, maxTokens: 1200 },
    opts.signal,
  );

  return {
    score: quality.score,
    summary: reply,
    strengths: quality.passed.map((p) => `present: ${p}`),
    weaknesses: quality.missing.map((m) => `missing: ${m}`),
    suggestions: quality.missing,
  };
}