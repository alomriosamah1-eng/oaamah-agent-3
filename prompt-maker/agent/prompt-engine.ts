// Prompt Maker — pure prompt-engineering pipeline.
//
// Understand → intent → skill → structure → output-only guard → validate →
// smart title. Every function here is pure / Node-testable (no RN imports),
// and intentionally encodes the prompt-engineering methodology verbatim from
// the project skill library via the prompt-skill-adapter.

import { validatePrompt } from '../../utils/promptModel';
import type { PromptLang } from '../types/prompt-types';
import type { PromptQuality } from '../types/prompt-types';
import {
  detectIntent,
  detectLang,
  pickSkill,
  type PromptIntent,
  type PromptSkillView,
} from '../skills/prompt-skill-adapter';

export interface IntentExtract {
  lang: PromptLang;
  intent: PromptIntent;
  skill: PromptSkillView;
}

export function extractIntentLang(
  input: string,
  lang?: PromptLang,
  intent?: PromptIntent,
): IntentExtract {
  const pickedLang = lang ?? detectLang(input);
  const pickedIntent = intent ?? detectIntent(input);
  return { lang: pickedLang, intent: pickedIntent, skill: pickSkill(pickedIntent) };
}

/* ------------------------------------------------------------------ */
/* System instruction built from the chosen skill                      */
/* ------------------------------------------------------------------ */

export function buildInstructionPrompt(skill: PromptSkillView, lang: PromptLang): string {
  const rules = skill.rules
    .map((r, i) => `${i + 1}. ${r}`)
    .join('\n');
  const anti = skill.antiPatterns
    .map((a) => (lang === 'ar' ? `- تجنب: ${a}` : `- Avoid: ${a}`))
    .join('\n');

  if (lang === 'ar') {
    return `أنت متخصص في هندسة البرومبتات (Prompt Engineering). مهمتك الوحيدة: تحويل طلب المستخدم إلى برومبت احترافي واحد.

القواعد التي تطبقها بدقة (مهارة «${skill.name}»):
${rules}

نماذج ممنوعة:
${anti}

لا تسأل المستخدم عن أي تفاصيل ناقصة — إذا غاب سياق جوهري، ضمّن افتراضًا معقولًا داخل البرومبت (قسم «افتراضات معقولة»).
أخرج البرومبت النهائي فقط داخل كتلة markdown \`\`\`prompt ... \`\`\` — بدون مقدمات، بدون شرح، بدون خاتمة، بدون أي نص خارج الكتلة.`;
  }
  return `You are a prompt engineering specialist. Your ONLY mission: turn the user's request into a single professional prompt.

Rules you follow precisely (the "${skill.name}" skill):
${rules}

Anti-patterns to avoid:
${anti}

Never ask the user for missing details — if a critical detail is absent, embed a reasonable assumption inside the prompt (an "Assumptions" section) and move on.
Output ONLY the final prompt inside a markdown \`\`\`prompt ... \`\`\` block — no preamble, no explanation, no closing, no text outside the block.`;
}

/* ------------------------------------------------------------------ */
/* User-turn builders                                                  */
/* ------------------------------------------------------------------ */

export function buildUserMessage(
  userRequest: string,
  lang: PromptLang,
  transform?: { op: 'regenerate' | 'improve' | 'shorten' | 'expand'; current: string },
): string {
  if (!transform) {
    return lang === 'ar'
      ? `طلب المستخدم لبناء برومبت:\n${userRequest}\n\nابنِ البرومبت باللغة العربية.`
      : `User request for building a prompt:\n${userRequest}\n\nBuild the prompt in English.`;
  }

  const action: Record<typeof transform.op, { ar: string; en: string }> = {
    regenerate: { ar: 'أعد بناء البرومبت من جديد بجودة أعلى.', en: 'Rebuild the prompt from scratch with higher quality.' },
    improve: {
      ar: 'حسّن البرومبت: أصلح نقاط الضعف، أضف التفاصيل المفقودة، اجعل الأهداف كمّية.',
      en: 'Improve the prompt: fix weaknesses, add missing detail, make goals quantitative.',
    },
    shorten: { ar: 'اختصر البرومبت لأقصر صيغة فعّالة دون فقدان المعنى.', en: 'Shorten the prompt to the most concise effective form without losing meaning.' },
    expand: { ar: 'وسّع البرومبت: أضف أمثلة، حالات حافة، ومعايير نجاح مفصلة.', en: 'Expand the prompt: add examples, edge cases, and detailed success criteria.' },
  };

  return lang === 'ar'
    ? `الطلب الأصلي: ${userRequest}\n\nالبرومبت الحالي:\n${transform.current}\n\n${action[transform.op].ar}`
    : `Original request: ${userRequest}\n\nCurrent prompt:\n${transform.current}\n\n${action[transform.op].en}`;
}

export function buildAnalysisUser(promptText: string, lang: PromptLang, missing: string[]): string {
  return lang === 'ar'
    ? `حلّل هذا البرومبت:\n\n${promptText}\n\nالمعايير المفقودة حاليًا: ${missing.join(', ') || 'لا شيء'}\n\nأخرج: ملخص، نقاط قوة، نقاط ضعف، 3-5 تحسينات قابلة للتطبيق.`
    : `Analyze this prompt:\n\n${promptText}\n\nCurrently missing: ${missing.join(', ') || 'none'}\n\nOutput: summary, strengths, weaknesses, 3-5 actionable improvements.`;
}

/* ------------------------------------------------------------------ */
/* Output-only guard                                                   */
/* ------------------------------------------------------------------ */

const EXTRACT_BLOCK = /```(?:prompt|text|markdown)?\s*([\s\S]*?)```/i;

function stripFences(reply: string): string {
  const match = reply.match(EXTRACT_BLOCK);
  if (match && match[1].trim().length > 0) return match[1].trim();
  return reply.trim();
}

const LEAD_IN =
  /^(?:here (?:is|are)|here's|i(?:'ve| have) (?:created|written|built|prepared|made)|this is(?: the)? (?:prompt|final)|sure(?:,|!)?|of course|ok(?:ay)?,? here|بالطبع|حسنًا|حسناً|هيا|إليك|إليك البرومبت|هذا هو|هذا البرومبت|تم إنشاء|تم إعداد|تم بناء|هذه نتيجة|هذا النص)/i;

const VALEDICTION =
  /\n[\n\s]*(?:good luck|happy to help|feel free to|best regards|بالتوفيق|تم الانتهاء|تم النجاح|مع التقدير)\s*[.!]*\s*$/i;

export function sanitizeOutput(reply: string): string {
  let text = stripFences(reply);

  const firstLine = text.split('\n', 1)[0]?.trim() ?? '';
  if (firstLine.length > 0 && firstLine.length < 90 && LEAD_IN.test(firstLine)) {
    const cut = text.indexOf('\n');
    if (cut !== -1) text = text.slice(cut + 1).trim();
  }

  text = text.replace(VALEDICTION, '').trim();
  return text;
}

/* ------------------------------------------------------------------ */
/* Quality assessment                                                 */
/* ------------------------------------------------------------------ */

export function assessQuality(prompt: string): PromptQuality {
  const { score, passed, missing } = validatePrompt(prompt);
  return { score, passed, missing };
}

/* ------------------------------------------------------------------ */
/* Smart title                                                         */
/* ------------------------------------------------------------------ */

const EN_LEAD_CLAUSES: RegExp[] = [
  /^(?:i(?:'d| would|'m| am|:)? (?:need|want|like)(?: (?:to|that))?(?: (?:create|make|build|write|design|generate))?)\s+/i,
  /^(?:please|pls|kindly)\s+/i,
  /^(?:build|create|make|write|design|generate|give|provide)(?: me)?(?: a| an)?(?: new)?\s*(?:prompt)?\s*(?:for|to|that)?\s*(?:the llm|it)?\s*(?:behave|act|work)?\s*(?:as|like)?\s+/i,
  /^(?:a prompt (?:for|to|that))\s+/i,
  /^(?:make|makes)(?: the llm| it)?(?: behave| act)(?: as| like)?\s+/i,
];

const AR_LEAD = /^(?:برومبت(?: لـ| للـ| ل| عن| عن | بخصوص| الخاص ب| يخص|:)?|بروبت(?: لـ| للـ| ل| عن| عن | بخصوص| الخاص ب| يخص|:)?|صمم(?: لي)? |أنشئ(?: لي)? |أنشأ(?: لي)? |ابنِ(?: لي)? |أعمل(?: لي)? |أريد(?: برومبت)?(?: لـ| للـ| ل)? |اريد(?: برومبت)?(?: لـ| للـ| ل)? |اكتب(?: لي)? |اكتبلي |اعطني|أعطني(?: برومبت)?\s*)/i;

const AR_STOP = new Set([
  'اعتبرني', 'أعتبرني', 'انظر', 'أنت', 'أنا', 'تصرف', 'تتصرف', 'اجعل', 'جعل', 'استخدم', 'تحتاج',
  'تريد', 'أريد', 'اريد', 'أكون', 'كون', 'ساعدني', 'افترض', 'لأن', 'لكي', 'حتى', 'من', 'في', 'على',
  'إلى', 'الى', 'عن', 'مع', 'ثم', 'أو', 'اذا', 'إذا', 'برجاء', 'من فضلك', 'من فضلكم',
]);

function stripEnLead(raw: string): string {
  let s = raw;
  for (let i = 0; i < 3; i += 1) {
    let advanced = false;
    for (const re of EN_LEAD_CLAUSES) {
      const m = s.match(re);
      if (m) {
        s = s.slice(m[0].length);
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return s;
}

const EN_STOP = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'with', 'that', 'this', 'and', 'or', 'be', 'is', 'are',
  'it', 'its', 'you', 'your', 'me', 'my', 'please', 'need', 'want', 'build', 'create', 'make', 'give', 'write',
]);

function capitalizeWord(w: string): string {
  return w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w;
}

export function makeTitle(userRequest: string, intent: string, lang: PromptLang): string {
  let raw = userRequest.trim().replace(/[!.؟?]+$/g, '').trim();
  const firstSegment = (raw.split(/\n/)[0] ?? '').split(/[,،。.]/)[0] ?? '';
  raw = firstSegment.trim();

  if (lang === 'ar') {
    raw = raw.replace(AR_LEAD, '').trim();
    const tokens = raw
      .split(/\s+/)
      .filter((w) => w.length > 0 && !AR_STOP.has(w))
      .slice(0, 5);
    const title = tokens.join(' ');
    return title.length > 0 ? title.replace(/[،؛]$/, '') : `برومبت ${intent}`;
  }

  raw = stripEnLead(raw);
  const tokens = raw
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w'-]+|[^\w'-]+$/g, ''))
    .filter((w) => w.length > 0 && !EN_STOP.has(w.toLowerCase()))
    .slice(0, 6);
  if (tokens.length === 0) return `Prompt ${intent}`;
  return tokens.map(capitalizeWord).join(' ');
}