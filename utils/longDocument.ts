// Long-document builder — pure, Node-testable.
//
// Scales the PDF agent to very large documents (100/500/1000+ pages) by
// generating a bounded document in *sections* instead of one single-shot
// maxTokens-4000 call:
//
//   1. planning   — an outline call produces N section titles + guidance
//   2. writing    — each section is generated (and appended) independently;
//                   a failing section retries and then is skipped without
//                   collapsing the rest of the document
//   3. completing — the successful sections are wrapped in a DocumentSchema
//
// The LLM call is injectable (no Expo/RN imports) so the whole flow is tested
// with a fake model under Node.

import type { Block, DocumentSchema } from './documentSchema';
import { markdownToDocument } from './documentSchema';
import type { PdfMessage } from './chatClean';
import { cleanChatMessages, conversationToPrompt, messagesToMarkdown } from './chatClean';
import { extractJson } from './jsonExtract';
import { detectLang } from './taskModel';

export type LongLlm = (
  args: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  },
  signal?: AbortSignal,
) => Promise<string>;

export interface LongStatus {
  phase: 'planning' | 'writing' | 'completing';
  /** Short user-facing status label only (no reasoning). */
  label?: string;
  current?: number;
  total?: number;
}

export interface LongDocOptions {
  title?: string;
  lang?: 'ar' | 'en';
  model?: string;
  signal?: AbortSignal;
  llm: LongLlm;
  /** Explicit section count override (normalized by resolveTargetSections). */
  targetSections?: number;
  onStatus?: (status: LongStatus) => void;
}

/* ------------------------------------------------------------------ */
/* Page/intent parsing (pure heuristics)                               */
/* ------------------------------------------------------------------ */

const AR_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

function toLatinDigits(text: string): string {
  return text
    .split('')
    .map((c) => AR_DIGITS[c] ?? c)
    .join('');
}

/** Number of pages requested in the prompt ("100 صفحة", "500 pages"), 0 if none. */
export function detectPageTarget(text: string): number {
  const normalized = toLatinDigits(text.toLowerCase());
  const match = normalized.match(
    /(\d+)\s*(?:صفحة|صفحات|pages?|page)(?![\d\u0600-\u06ff\u0660-\u0669a-z])/,
  );
  if (match) {
    const n = parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Map a page target to a section count. Each generated section yields roughly
 * several printed pages, so a 100-page document needs ~25 sections and a
 * 500-page one is capped by the section budget.
 */
export function resolveTargetSections(
  pages: number,
  opts?: { base?: number; min?: number; max?: number },
): number {
  const base = opts?.base ?? 8;
  const min = opts?.min ?? 4;
  const max = opts?.max ?? 120;
  if (!pages || pages <= 0) return base;
  const sections = Math.round(pages / 4);
  return Math.max(min, Math.min(max, sections));
}

/** Did the user ask for the long-form (many-page) PDF path? */
export function isLongDocRequest(text: string): boolean {
  const lower = toLatinDigits(text.toLowerCase());
  // \b never matches around Arabic letters in JS, so use an explicit
  // "not followed by an alphanumeric or Arabic letter/digit" guard instead.
  const pageTerms =
    /(?:صفحة|صفحات|pages?|page)(?![\d\u0600-\u06ff\u0660-\u0669a-z])/;
  if (/\d+\s*(?:صفحة|صفحات|pages?|page)(?![\d\u0600-\u06ff\u0660-\u0669a-z])/.test(lower)) {
    return true;
  }
  return (
    pageTerms.test(lower) ||
    /مفصل|مفصّل|طويل|شامل/.test(lower) ||
    /\b(long|detailed|extensive|in-depth|comprehensive)\b/.test(lower)
  );
}

/** Bounded conversation excerpt so per-section calls stay constant-size. */
export function excerptText(text: string, maxChars: number): string {
  const max = Math.max(200, Math.floor(maxChars));
  if (text.length <= max) return text;
  const headLen = Math.floor(max / 2);
  const head = text.slice(0, headLen);
  const tail = text.slice(text.length - (max - headLen));
  return `${head}\n…[وسيط محذوف لضبط الحجم]…\n${tail}`;
}

/** Keeps only well-formed block objects from a model reply. */
export function sanitizeBlocks(blocks: unknown): Block[] {
  if (!Array.isArray(blocks)) return [];
  const valid: Block[] = [];
  for (const b of blocks) {
    if (
      typeof b === 'object' &&
      b !== null &&
      typeof (b as { type?: unknown }).type === 'string'
    ) {
      valid.push(b as Block);
    }
  }
  return valid;
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const DOC_JSON_RULE =
  'Reply with ONLY a single valid JSON object matching the requested schema. No markdown fences, no commentary, no explanation, no trailing text.';

function outlineSystem(lang: 'ar' | 'en', target: number): string {
  if (lang === 'ar') {
    return `أنت محرك تقسيم المستندات في وكيل أسامة. مهمتك تحويل محادثة مرفقة إلى خطة أقسام لمستند احترافي طويل.
أنشئ حوالي ${target} أقسام تغطي كل المحتوى الجوهري للمحادثة وتوسّعه بدون تكرار أو حشو.
القسم الأول يجب أن يكون ملخصًا تنفيذيًا للمحادثة كاملة.
أسماء الأقسام وتعليماتها بنفس لغة المحادثة.
أعد JSON فقط بهذا الشكل:
{ "sections": [ { "title": "عنوان القسم", "guidance": "ماذا يُكتب بالضبط في هذا القسم" } ] }
بدون تفسير أو شرح خارج JSON.`;
  }
  return `You are the document planner of Osamah agent. Turn the attached conversation into a section outline for a long professional document.
Create about ${target} sections covering the substantive content and expanding it without repetition or filler.
The first section must be an executive summary of the whole conversation.
Section titles and guidance must match the conversation's language.
Reply with ONLY JSON shaped as:
{ "sections": [ { "title": "section title", "guidance": "exactly what this section writes" } ] }
No commentary outside the JSON.`;
}

function sectionSystem(lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return `أنت محرك كتابة المقاطع في وكيل أسامة. اكتب مقطعًا واحدًا فقط من مستند طويل.
الرد كله JSON واحد صالح بهذا الشكل:
{ "blocks": [ ...كتل المخطط... ] }
الكتل المسموحة (type):
heading, paragraph, list, checklist, table, card, callout, quote, code, stats, comparison, timeline, section, hr
قواعد:
1. لا تكرر عنوان القسم ككتلة heading — العنوان يُضاف تلقائيًا.
2. احتفظ بالعمق والدقة؛ استخدم الجداول للمقارنات والبيانات المتوازية.
3. النصوص تناسب لغة المستند.
4. لا تذكر أي حالة داخلية، ولا حشو، ولا ملاحظات خارج JSON.`;
  }
  return `You are the section writer of Osamah agent. Write only ONE section of a long document.
Reply with ONLY a single valid JSON object shaped as:
{ "blocks": [ ...schema blocks... ] }
Allowed block types (type):
heading, paragraph, list, checklist, table, card, callout, quote, code, stats, comparison, timeline, section, hr
Rules:
1. Do NOT emit the section title as a heading block — the title is added automatically.
2. Keep depth and accuracy; prefer tables for comparisons and parallel data.
3. Match the document language.
4. No internal status talk, no filler, no commentary outside the JSON.`;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

/**
 * Build a full long-form DocumentSchema from a conversation by generating it
 * in bounded sections. Any failure path falls back to a plain markdown-derived
 * schema so the user's request never collapses silently.
 */
export async function buildLongDocument(
  messages: PdfMessage[],
  opts: LongDocOptions,
): Promise<DocumentSchema> {
  const cleaned = cleanChatMessages(messages);
  const lang =
    opts.lang ??
    detectLang(
      cleaned.map((m) => m.content).join(' ') || opts.title || 'ar',
    );
  const title =
    opts.title ?? (lang === 'ar' ? 'المستند الشامل' : 'Comprehensive document');
  const base = markdownToDocument(messagesToMarkdown(cleaned), title);

  if (cleaned.length === 0 || opts.signal?.aborted) return base;

  const requestText =
    cleaned.find((m) => m.role === 'user')?.content ?? cleaned[0]?.content ?? '';
  const target =
    opts.targetSections ??
    resolveTargetSections(detectPageTarget(requestText));

  opts.onStatus?.({
    phase: 'planning',
    label: lang === 'ar' ? 'جارٍ تقسيم المستند إلى أقسام…' : 'Planning sections…',
  });

  let outline: { title: string; guidance: string }[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (opts.signal?.aborted) break;
    let reply = '';
    try {
      reply = await opts.llm(
        {
          system: outlineSystem(lang, target),
          user: conversationToPrompt(cleaned),
          temperature: 0.3,
          maxTokens: 2000,
          model: opts.model,
        },
        opts.signal,
      );
    } catch {
      reply = '';
    }
    if (reply) {
      try {
        const parsed = extractJson<{
          sections?: Array<{ title?: unknown; guidance?: unknown }>;
        }>(reply);
        if (parsed && Array.isArray(parsed.sections)) {
          const candidate = parsed.sections
            .map((s) => ({
              title:
                typeof s?.title === 'string' ? s.title.trim() : '',
              guidance:
                typeof s?.guidance === 'string' ? s.guidance.trim() : '',
            }))
            .filter((s) => s.title !== '');
          if (candidate.length > 0) {
            outline = candidate;
            break;
          }
        }
      } catch {
        // malformed outline — retry
      }
    }
  }

  if (outline.length === 0 || opts.signal?.aborted) return base;

  const convo = conversationToPrompt(cleaned);
  const sections: Block[] = [];
  let written = 0;
  const total = outline.length;

  for (let i = 0; i < outline.length; i++) {
    if (opts.signal?.aborted) break;
    const part = outline[i];
    opts.onStatus?.({
      phase: 'writing',
      label:
        lang === 'ar'
          ? `جارٍ كتابة القسم ${i + 1} من ${total}…`
          : `Writing section ${i + 1} of ${total}…`,
      current: i + 1,
      total,
    });

    let blocks: Block[] | null = null;
    for (let attempt = 0; attempt < 3 && !blocks; attempt++) {
      if (opts.signal?.aborted) break;
      try {
        const reply = await opts.llm(
          {
            system: sectionSystem(lang),
            user: `${DOC_JSON_RULE}\n\nDocument title: ${title}\nSection ${i + 1}/${total}: ${part.title}\nGuidance: ${part.guidance}\n\nConversation context:\n${excerptText(convo, 8000)}`,
            temperature: 0.4,
            maxTokens: 3000,
            model: opts.model,
          },
          opts.signal,
        );
        const parsed = extractJson<{ blocks?: unknown }>(reply);
        const candidate = sanitizeBlocks(parsed?.blocks);
        if (candidate.length > 0) blocks = candidate;
      } catch {
        // independent sections continue if this one keeps failing
      }
    }

    if (blocks && blocks.length > 0) {
      sections.push(
        { type: 'heading', level: 2, content: [part.title] },
        ...blocks,
      );
      written += 1;
    }
  }

  if (sections.length === 0) return base;

  opts.onStatus?.({
    phase: 'completing',
    label: lang === 'ar' ? 'جارٍ تجميع المستند…' : 'Completing document…',
  });

  const dateLabel = new Date().toLocaleString(
    lang === 'ar' ? 'ar-EG' : 'en-GB',
    { dateStyle: 'long', timeStyle: 'short' },
  );

  return {
    metadata: {
      title,
      author: lang === 'ar' ? 'وكيل أسامة' : 'Osamah agent',
      date: dateLabel,
      lang,
      description:
        lang === 'ar'
          ? `مستند شامل مكوّن من ${written} أقسام`
          : `Comprehensive document in ${written} sections`,
    },
    theme: { mode: 'dark' },
    cover: {
      title,
      subtitle:
        lang === 'ar'
          ? `مستند شامل في ${written} أقسام`
          : `Comprehensive document — ${written} sections`,
      badge: 'وكيل أسامة',
    },
    sections,
  };
}