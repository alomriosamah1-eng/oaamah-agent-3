// PDF print helpers — pure, Node-testable.
//
// Everything in this module is free of Expo/React-Native imports so it can run
// under the test harness. It centralises the print-side presentation concerns:
//
//   1. The print token palette + @page CSS (white page, very dark bold text,
//      only a small page number in the header — nothing else).
//   2. A large cover icon chosen to match the document topic.
//   3. Title derivation from a user request / chat title so generated files
//      get an appropriate name instead of a generic timestamp.
//   4. Chunking a large DocumentSchema into renderable parts (last-resort
//      fallback so a PDF is always produced, however long the document).
//   5. Overall progress mapping (percent per phase) used to surface
//      "label … 45% • 12s" in the chat status message.

import {
  buildDocumentHtml,
  DocumentSchema,
  tokensForMode,
} from './documentSchema';
import type { Block } from './documentSchema';

/** English app-name watermark — kept for compatibility, no longer rendered. */
export const PDF_WATERMARK = 'OSAMAH AGENT';

export type PdfMode = 'dark' | 'light' | 'print';

/* ------------------------------------------------------------------ */
/* @page CSS (page number only)                                       */
/* ------------------------------------------------------------------ */

export function buildPrintPageCss(mode: PdfMode = 'print'): string {
  const t = tokensForMode(mode);
  return `
  @page {
    margin: 18mm 14mm 16mm 14mm;
    @top-right {
      content: counter(page);
      font-size: 9px;
      color: ${t.textSecondary};
      margin-bottom: 6mm;
    }
  }
  h1, h2, h3, h4 { page-break-after: avoid; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .avoid-break { page-break-inside: avoid; }
  .page-break { page-break-before: always; }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  `;
}

/** Inject the print @page CSS into a generated HTML document. */
export function injectPrintCss(html: string, mode: PdfMode = 'print'): string {
  return html.replace(/<\/style>/, `${buildPrintPageCss(mode)}\n</style>`);
}

/** Render a schema to final, print-ready HTML (page CSS only). */
export function renderPrintHtml(
  schema: DocumentSchema,
  mode: PdfMode = 'print',
): string {
  const finalSchema =
    mode === schema.theme.mode ? schema : { ...schema, theme: { ...schema.theme, mode } };
  return injectPrintCss(buildDocumentHtml(finalSchema), mode);
}

/* ------------------------------------------------------------------ */
/* Cover icon (chosen to match the document topic)                    */
/* ------------------------------------------------------------------ */

const COVER_ICON_ALLOWED = new Set<string>([
  '🤖', '🚀', '💻', '🖥️', '💰', '🩺', '📚', '✈️', '🍳', '🎨',
  '🎵', '🏋️', '🌿', '⚖️', '🏛️', '🧠', '🕌', '🧮', '🔬', '📝',
  '📊', '📄',
]);

const COVER_ICON_RULES: [RegExp, string][] = [
  [/\bai\b|الذكاء|اصطناع|ذكاء إصطناعي|شات بوت|chatbot|وكيل|agent/i, '🤖'],
  [/الفضاء|كواكب|نجوم|فلك|أقمار|صواريخ|space|astronomy|rocket|planet/i, '🚀'],
  [/برمجة|برمجه|كود|مطور|برمجيات|تطبيقات|software|coding|developer|program|api/i, '💻'],
  [/تقنية|تكنولوجيا|إنترنت|شبكات|رقمي|إلكتروني|tech|digital|internet|cyber/i, '🖥️'],
  [/مال|اقتصاد|استثمار|تجارة|بورصة|عملات|محاسبة|تمويل|سوق|مبيعات|finance|economy|invest|trading|market|money|currency/i, '💰'],
  [/صحة|طبي|طبيب|أطباء|دواء|مستشفى|سكري|قلب|نظام غذائي|حمية|health|medical|doctor|medicine|diet/i, '🩺'],
  [/تعليم|دراسة|مدرسة|جامعة|تعلم|درس|طلاب|منهج|education|study|school|university|lesson/i, '📚'],
  [/سفر|سياح|رحلات|رحلة|رحله|فنادق|طيران|سائح|وجهات|travel|tourism|tourist|hotel|flight|destination/i, '✈️'],
  [/طعام|مطبخ|وصفات|أكل|اكل|مشروبات|طبخ|سفرة|recipe|food|cooking|kitchen|meal|cuisine/i, '🍳'],
  [/فن|رسم|تصميم|لوحات|إبداع|تصوير|جرافيك|موضة|art|design|drawing|paint|graphic|fashion/i, '🎨'],
  [/موسيقى|أغاني|اغاني|غناء|لحن|عزف|music|song|sing/i, '🎵'],
  [/رياضة|لياقة|كمال اجسام|جيم|تمرين|كرة|مباراة|sport|fitness|gym|football|workout/i, '🏋️'],
  [/طبيعة|بيئة|مناخ|زراعة|نبات|حيوان|بحر|طقس|حدائق|nature|environment|climate|plants|animals|garden/i, '🌿'],
  [/قانون|قوانين|حقوق|عقد|محكمة|مدني|جنائي|توثيق|law|legal|contract|court/i, '⚖️'],
  [/تاريخ|حضارة|آثار|تراث|أحداث|وثائقي|history|heritage|civilization|documentary/i, '🏛️'],
  [/علم النفس|تطوير الذات|تنمية بشرية|مهارات|إنتاجية|ثقة|تحفيز|عادات|psychology|self[ -]development|motivation|habits|productivity/i, '🧠'],
  [/دين|إسلام|قرآن|فقه|أذكار|صلاة|عبادات|islam|mosque|quran|prayer/i, '🕌'],
  [/رياضيات|حساب|إحصاء|معادلات|جبر|هندسة رياضية|math|mathematics|statistics|algebra|equation/i, '🧮'],
  [/علوم|فيزياء|كيمياء|أحياء|بحث علمي|تجربة|مختبر|science|physics|chemistry|biology|experiment|lab/i, '🔬'],
  [/كتابة|مقال|مستند|تقرير|كتاب|قصة|رواية|عرض|برزنتيشن|ملخص|writing|article|report|story|book|novel|summary|presentation/i, '📝'],
  [/أعمال|إدارة|شركة|نشاط تجاري|مشروع|تخطيط|استراتيجية|اجتماع|ريادة|business|management|company|startup|project|strategy|leadership/i, '📊'],
];

/** Pick a topic emoji by scanning a text (request/conversation) heuristically. */
export function coverIconFor(text?: string): string {
  const src = (text ?? '').replace(/\s+/g, ' ').trim();
  if (src.length < 2) return '📄';
  for (const [re, emoji] of COVER_ICON_RULES) {
    if (re.test(src)) return emoji;
  }
  return '📄';
}

/** Resolve the final cover icon: accept a curated emoji, else heuristics. */
export function resolveCoverIcon(icon?: string, topicText?: string): string {
  const candidate = (icon ?? '').trim();
  if (candidate && COVER_ICON_ALLOWED.has(candidate)) return candidate;
  return coverIconFor(topicText);
}

/* ------------------------------------------------------------------ */
/* Title derivation (file naming)                                     */
/* ------------------------------------------------------------------ */

const TRIGGER_RE =
  /^(?:أنشئ|أنشأ|انشئ|انشئي|اصنع|أنتج|أنجز|توليد|إنشاء|اكتب|أكتب|اكتبي|أعد|حضّر|جهّز|حول|generate|create|build|make|write)\s+/i;

/** A short, user-facing title for a generated document/file name. */
export function deriveDocumentTitle(
  text?: string,
  chatTitle?: string,
  lang: 'ar' | 'en' = 'ar',
): string {
  const fallbackBase =
    lang === 'ar' ? 'مستند المحادثة' : 'Conversation document';
  const withDate = (base: string) =>
    `${base} — ${new Date().toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    })}`;

  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned.length >= 3) {
    const stripped = cleaned
      .replace(TRIGGER_RE, '')
      .replace(/\bpdfs?\b/gi, ' ')
      .replace(/^(?:ملف|مستند)\s+/, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.+$/, '')
      .trim();
    const candidate = stripped.length >= 3 ? stripped : '';
    if (candidate) {
      return candidate.length > 60
        ? `${candidate.slice(0, 60).trimEnd()}…`
        : candidate;
    }
  }

  if (chatTitle && chatTitle.trim().length >= 3) {
    const t = chatTitle.trim();
    return t.length > 60 ? `${t.slice(0, 60).trimEnd()}…` : t;
  }

  return withDate(fallbackBase);
}

/** File-name-safe version of a title (no path hazards, bounded length). */
export function sanitizePdfName(title: string): string {
  const clean = title
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = clean.replace(/^\.+/, '') || `document-${Date.now()}`;
  return safe.length > 80 ? safe.slice(0, 80).trimEnd() : safe;
}

/* ------------------------------------------------------------------ */
/* Chunking (last-resort multi-part rendering)                        */
/* ------------------------------------------------------------------ */

function blockApproxBytes(b: Block): number {
  try {
    return JSON.stringify(b).length;
  } catch {
    return 200;
  }
}

/**
 * Split a schema's blocks into renderable parts so that even a very large
 * document can always be turned into files (one PDF per part).
 */
export function groupBlocksForParts(
  blocks: Block[],
  maxPerPart = 12,
  maxCharsPerPart = 10_000,
): Block[][] {
  const parts: Block[][] = [];
  let cur: Block[] = [];
  let curLen = 0;
  for (const b of blocks) {
    const len = blockApproxBytes(b);
    if (
      cur.length > 0 &&
      (cur.length >= maxPerPart || curLen + len > maxCharsPerPart)
    ) {
      parts.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(b);
    curLen += len;
  }
  if (cur.length > 0) parts.push(cur);
  return parts.length > 0 ? parts : [[]];
}

/* ------------------------------------------------------------------ */
/* Progress (percent per phase)                                       */
/* ------------------------------------------------------------------ */

/** Overall percent for a phase; `writing` uses the section fraction. */
export function pdfPercent(
  phase: string,
  current?: number,
  total?: number,
): number {
  switch (phase) {
    case 'organizing':
      return 10;
    case 'planning':
      return 15;
    case 'writing': {
      const frac =
        typeof current === 'number' &&
        typeof total === 'number' &&
        total > 0
          ? Math.min(1, current / total)
          : 0;
      return Math.round(20 + 70 * frac);
    }
    case 'completing':
    case 'building':
      return 92;
    case 'rendering':
      return 96;
    case 'verifying':
      return 98;
    case 'done':
      return 100;
    default:
      return 50;
  }
}