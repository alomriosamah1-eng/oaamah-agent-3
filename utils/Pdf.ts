// Osamah Agent Document Engine — on-device PDF generation.
//
// The engine is built around a structured document schema (utils/documentSchema.ts)
// rendered to RTL-aware, theme-matched HTML and printed by expo-print. It also ships
// a "PDF agent": a model-driven pass that gathers the current conversation, organizes
// it into a structured document (sections, headings, tables, cards...), and filters
// out assistant status/tool chatter so the PDF contains only substantive content.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  Block,
  buildDocumentHtml,
  Content,
  DocumentSchema,
  markdownToDocument,
} from '@/utils/documentSchema';
import { chatComplete, extractJson, getSelectedZenModel } from '@/utils/OpenCodeAgent';
import { storage } from '@/utils/Storage';
import {
  cleanChatMessages,
  conversationToPrompt,
  messagesToMarkdown,
  PdfMessage,
} from '@/utils/chatClean';
import { buildLongDocument, LongLlm } from '@/utils/longDocument';

// Re-exported for backward compatibility — the logic lives in utils/chatClean.ts.
export { cleanChatMessages, messagesToMarkdown, PdfMessage };

/* ------------------------------------------------------------------ */
/* Markdown → HTML (kept for backward compatibility / tool reuse)      */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function markdownToHtml(markdown: string): string {
  const doc = markdownToDocument(markdown, 'document');
  return renderBlocksHtml(doc.sections, 'dark');
}

/** Shared internal renderer — renders schema blocks with the design tokens. */
import { renderBlock, renderBlocks, designTokens } from '@/utils/documentSchema';

function renderBlocksHtml(blocks: Block[], mode: 'dark' | 'light'): string {
  const tokens = mode === 'dark' ? designTokens.dark : designTokens.light;
  return blocks.map((b) => renderBlock(b, tokens)).join('\n');
}

/* ------------------------------------------------------------------ */
/* Theme + page layout (page numbers at the top corner)                */
/* ------------------------------------------------------------------ */

function pageCss(mode: 'dark' | 'light'): string {
  const t = mode === 'dark' ? designTokens.dark : designTokens.light;
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
  `;
}

/* ------------------------------------------------------------------ */
/* Document schema → PDF                                               */
/* ------------------------------------------------------------------ */

export type PdfMode = 'dark' | 'light';

export interface AgentPdfOptions {
  title?: string;
  lang?: 'ar' | 'en';
  mode?: PdfMode;
  signal?: AbortSignal;
  model?: string;
  /** Progress callback — short user-facing status labels only. */
  onStatus?: (
    phase: 'organizing' | 'building' | 'rendering' | 'verifying' | 'done' | 'writing',
    label?: string,
    current?: number,
    total?: number,
  ) => void;
}

/**
 * Render a structured DocumentSchema to a PDF file on-device.
 * Handles very large documents by rendering schema sections incrementally
 * into a single HTML string (no DOM, string-join only).
 */
export async function generateDocumentPdf(
  schema: DocumentSchema,
  opts: { mode?: PdfMode } = {},
): Promise<string> {
  const html = buildDocumentHtml(schema);
  const { uri } = await Print.printToFileAsync({
    html: injectPageCss(html, opts.mode ?? schema.theme.mode ?? 'dark'),
  });
  return uri;
}

function injectPageCss(html: string, mode: PdfMode): string {
  const insertion = pageCss(mode);
  return html.replace(
    /<\/style>/,
    `${insertion}\n</style>`,
  );
}

/* ------------------------------------------------------------------ */
/* PDF agent — organizes the conversation into a structured document   */
/* ------------------------------------------------------------------ */

const DOCUMENT_JSON_RULE =
  'Reply with ONLY a single valid JSON object matching the requested schema. No markdown fences, no commentary, no explanation, no trailing text.';

const DOCUMENT_PLAN_SYSTEM = `You are the document organization engine of Osamah agent.
Your job: turn the raw conversation transcript below into a structured, professional Arabic document.
The document must contain ONLY the substantive content — the questions asked and the core information/knowledge conveyed in the answers.
Rules:
1. Remove every conversational filler: greetings, "سأقوم", "تم إنشاء", status lines, agent small talk, sign-offs.
2. Organize the remaining content into clear sections with headings, paragraphs, lists, tables, cards, callouts, and quotes as appropriate.
3. Prefer tables for comparisons and parallel data.
4. Keep the content faithful to the answers — do not invent new facts, do not reduce depth.
5. The document must stand alone: an executive summary at the top summarizing the whole exchange.

Output a JSON object with this exact schema:
{
  "metadata": { "title": "string", "subtitle": "string", "author": "string", "date": "string", "lang": "ar", "description": "string" },
  "theme": { "mode": "dark" },
  "cover": { "title": "string", "subtitle": "string", "badge": "وكيل أسامة", "description": "string" },
  "sections": [
    { "type": "heading", "level": 1, "content": ["التنفيذ"] },
    { "type": "paragraph", "content": ["string"] },
    { "type": "heading", "level": 2, "content": ["string"] },
    { "type": "list", "ordered": false, "items": [["string"], ["string"]] },
    { "type": "table", "columns": ["string"], "rows": [[["string"], ["string"]]], "caption": "string?" },
    { "type": "card", "title": "string?", "content": ["string"] },
    { "type": "callout", "kind": "note|tip|warning|important", "content": ["string"] },
    { "type": "quote", "text": "string", "author": "string?" },
    { "type": "code", "language": "string?", "code": "string" },
    { "type": "stats", "items": [{ "label": "string", "value": "string" }] },
    { "type": "timeline", "items": [{ "title": "string", "date": "string?", "content": ["string"] }] },
    { "type": "section", "title": "string", "blocks": [ ...nested blocks... ] },
    { "type": "comparison", "title": "string?", "columns": ["string"], "rows": [[["string"], ["string"]]] },
    { "type": "hr" }
  ]
}
Content fragments inside text fields may be strings or rich objects: {"bold": true, "text": "..."}, {"code": true, "text": "..."}.`;

/**
 * PDF agent: gather the session conversation and organize it into a
 * structured DocumentSchema. Falls back to a plain schema if the model fails.
 */
export async function organizeConversation(
  messages: PdfMessage[],
  opts: { title?: string; lang?: 'ar' | 'en'; model?: string; signal?: AbortSignal } = {},
): Promise<DocumentSchema> {
  const cleaned = cleanChatMessages(messages);
  const lang = opts.lang ?? 'ar';
  const title = opts.title ?? (lang === 'ar' ? 'مستند المحادثة' : 'Conversation document');

  if (cleaned.length === 0) {
    return markdownToDocument('# ' + title, title);
  }

  try {
    const model = opts.model ?? (await getSelectedZenModel());
    const reply = await chatComplete(
      {
        system: DOCUMENT_PLAN_SYSTEM,
        user: `${DOCUMENT_JSON_RULE}\n\nTitle: ${title}\n\nConversation:\n${conversationToPrompt(cleaned)}`,
        temperature: 0.4,
        maxTokens: 4000,
        model,
      },
      opts.signal,
    );

    const parsed = extractJson<DocumentSchema>(reply);
    if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      throw new Error('invalid document schema');
    }
    return {
      metadata: {
        title: parsed.metadata?.title || title,
        subtitle: parsed.metadata?.subtitle,
        author: parsed.metadata?.author || (lang === 'ar' ? 'وكيل أسامة' : 'Osamah agent'),
        date: new Date().toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
        lang,
        description: parsed.metadata?.description,
      },
      theme: { mode: 'dark' },
      cover: parsed.cover || {
        title: parsed.metadata?.title || title,
        badge: 'وكيل أسامة',
        subtitle: parsed.metadata?.subtitle,
      },
      sections: sanitizeSections(parsed.sections),
    };
  } catch {
    const markdown = messagesToMarkdown(cleaned);
    return markdownToDocument(markdown, title);
  }
}

function sanitizeSections(blocks: Block[]): Block[] {
  return blocks.filter((b) => typeof b === 'object' && b !== null && typeof (b as { type?: string }).type === 'string');
}

/* ------------------------------------------------------------------ */
/* Full flow: share the PDF after generation                           */
/* ------------------------------------------------------------------ */

export async function sharePdf(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('sharing_unavailable');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'PDF',
    UTI: 'com.adobe.pdf',
  });
}

function defaultDocTitle(lang: 'ar' | 'en'): string {
  return `${lang === 'ar' ? 'وكيل أسامة' : 'Osamah agent'} — ${new Date().toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}`;
}

/**
 * Full agent-driven flow: conversation → organized DocumentSchema → on-device
 * PDF file → native share sheet. Reports short lifecycle statuses via onStatus.
 */
export async function saveConversationAsPdf(
  messages: PdfMessage[],
  opts: AgentPdfOptions = {},
): Promise<string> {
  const lang = opts.lang ?? 'ar';
  const title = opts.title ?? defaultDocTitle(lang);

  opts.onStatus?.('organizing', lang === 'ar' ? 'جارٍ تنظيم المحتوى…' : 'Organizing content…');

  const schema = await organizeConversation(messages, {
    title,
    lang,
    model: opts.model,
    signal: opts.signal,
  });

  opts.onStatus?.('building', lang === 'ar' ? 'جارٍ بناء المستند…' : 'Building document…');

  const uri = await generateDocumentPdf(schema, { mode: opts.mode ?? 'dark' });

  opts.onStatus?.('rendering', lang === 'ar' ? 'جارٍ إنشاء الملف…' : 'Generating file…');

  await sharePdf(uri);

  opts.onStatus?.('verifying', lang === 'ar' ? 'جارٍ التحقق…' : 'Verifying…');
  opts.onStatus?.('done', lang === 'ar' ? 'تم إنشاء الملف' : 'File created');

  return uri;
}

/**
 * Long-form variant of the PDF flow. Routes the conversation through
 * buildLongDocument (sectioned, scalable to 100/500/1000+ pages) instead of
 * the single-shot organizer, then renders/shares exactly like the basic flow.
 */
export async function saveConversationAsLongPdf(
  messages: PdfMessage[],
  opts: AgentPdfOptions = {},
): Promise<string> {
  const lang = opts.lang ?? 'ar';
  const title = opts.title ?? defaultDocTitle(lang);

  opts.onStatus?.('organizing', lang === 'ar' ? 'جارٍ تنظيم المحتوى…' : 'Organizing content…');

  const longLlm: LongLlm = async (args, signal) =>
    chatComplete(
      {
        system: args.system,
        user: args.user,
        temperature: args.temperature,
        maxTokens: args.maxTokens,
        model: args.model ?? opts.model ?? (await getSelectedZenModel().catch(() => undefined)),
      },
      signal,
    );

  const schema = await buildLongDocument(messages, {
    title,
    lang,
    model: opts.model,
    signal: opts.signal,
    llm: longLlm,
    onStatus: (status) =>
      opts.onStatus?.(
        status.phase === 'planning'
          ? 'organizing'
          : status.phase === 'writing'
            ? 'writing'
            : 'building',
        status.label,
        status.current,
        status.total,
      ),
  });

  opts.onStatus?.('building', lang === 'ar' ? 'جارٍ بناء المستند…' : 'Building document…');

  const uri = await generateDocumentPdf(schema, { mode: opts.mode ?? 'dark' });

  opts.onStatus?.('rendering', lang === 'ar' ? 'جارٍ إنشاء الملف…' : 'Generating file…');

  await sharePdf(uri);

  opts.onStatus?.('verifying', lang === 'ar' ? 'جارٍ التحقق…' : 'Verifying…');
  opts.onStatus?.('done', lang === 'ar' ? 'تم إنشاء الملف' : 'File created');

  return uri;
}

/* ------------------------------------------------------------------ */
/* Backward-compatible helpers (used by existing screens)              */
/* ------------------------------------------------------------------ */

export async function generatePdf(markdown: string, title: string): Promise<string> {
  const now = new Date();
  const dateLabel = now.toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' });
  const doc = markdownToDocument(markdown, title);
  doc.metadata.date = dateLabel;
  return generateDocumentPdf(doc, { mode: 'dark' });
}

export async function saveMarkdownAsPdf(markdown: string, title: string): Promise<string> {
  const uri = await generatePdf(markdown, title);
  await sharePdf(uri);
  return uri;
}

/* ------------------------------------------------------------------ */
/* Best-effort server archive                                          */
/* ------------------------------------------------------------------ */

export async function archiveToServer(
  title: string,
  content: string,
  type = 'chat',
): Promise<string | null> {
  const raw = (await storage.getString('serverUrl'))?.trim();
  if (!raw || raw === '') return null;
  const base = raw.replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${base}/api/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, content }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      return json?.document?.id ?? null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

export function pdfSupportedOnPlatform(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

export { renderBlocksHtml };
export type { Content };