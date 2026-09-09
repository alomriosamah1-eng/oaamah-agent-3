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
  referenceMarkdown,
  PdfMessage,
} from '@/utils/chatClean';
import { buildLongDocument, LongLlm } from '@/utils/longDocument';
import {
  deriveDocumentTitle,
  groupBlocksForParts,
  PdfMode,
  pdfPercent,
  renderPrintHtml,
  resolveCoverIcon,
} from '@/utils/pdfPrint';

// Re-exported for backward compatibility — the logic lives in utils/chatClean.ts.
export { cleanChatMessages, messagesToMarkdown, referenceMarkdown, PdfMessage };

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
import { renderBlock, designTokens } from '@/utils/documentSchema';

function renderBlocksHtml(blocks: Block[], mode: 'dark' | 'light'): string {
  const tokens = mode === 'dark' ? designTokens.dark : designTokens.light;
  return blocks.map((b) => renderBlock(b, tokens)).join('\n');
}

/* ------------------------------------------------------------------ */
/* Theme + page layout — see utils/pdfPrint.ts (pure, Node-testable)   */
/* ------------------------------------------------------------------ */

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
    progress?: { percent: number; elapsedMs: number },
  ) => void;
}

/** A produced PDF file plus the print-ready HTML used to render it
 *  (the HTML is saved alongside as the in-app reader preview). */
export interface PdfFile {
  uri: string;
  html: string;
  numberOfPages?: number;
  /** 1-based part index when the document had to be chunked. */
  part?: number;
  /** Total parts when chunked. */
  total?: number;
}

export interface PdfOutcome {
  files: PdfFile[];
  /** The document's content title — used as the saved file name. */
  title?: string;
}

const PDF_HTML_FALLBACK_MODE: PdfMode = 'print';

function schemaWithSections(
  schema: DocumentSchema,
  sections: Block[],
  keepCover: boolean,
): DocumentSchema {
  return {
    ...schema,
    cover: keepCover ? schema.cover : undefined,
    sections,
  };
}

async function printHtmlOnce(html: string): Promise<{ uri: string; numberOfPages?: number }> {
  const res = await Print.printToFileAsync({ html });
  if (!res?.uri) throw new Error('print_empty_file');
  return { uri: res.uri, numberOfPages: res.numberOfPages };
}

/**
 * Render a structured DocumentSchema to PDF file(s) on-device.
 * Never collapses silently: it retries once, then chunks the schema into
 * several parts so a file is still produced for arbitrarily large documents.
 */
export async function generateDocumentPdf(
  schema: DocumentSchema,
  opts: { mode?: PdfMode } = {},
): Promise<PdfOutcome> {
  const mode: PdfMode = opts.mode ?? schema.theme.mode ?? PDF_HTML_FALLBACK_MODE;
  const html = renderPrintHtml(schema, mode === 'print' ? 'print' : mode);

  const renderChunk = async (htmlStr: string): Promise<{ uri: string; numberOfPages?: number }> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const printed = await printHtmlOnce(htmlStr);
        return printed;
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }
    throw lastError;
  };

  try {
    const primary = await renderChunk(html);
    return { files: [{ uri: primary.uri, html, numberOfPages: primary.numberOfPages }] };
  } catch (err) {
    // Last-resort fallback: render the document part-by-part so files exist.
    const chunks = groupBlocksForParts(schema.sections);
    const total = chunks.length;
    const files: PdfFile[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkSchema = schemaWithSections(schema, chunks[i], i === 0);
      const chunkHtml = renderPrintHtml(chunkSchema, mode === 'print' ? 'print' : mode);
      try {
        const printed = await renderChunk(chunkHtml);
        files.push({ uri: printed.uri, html: chunkHtml, numberOfPages: printed.numberOfPages, part: i + 1, total });
      } catch {
        // A single part failing is tolerated — the rest still get written.
      }
    }
    if (files.length === 0) throw err;
    return { files };
  }
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
6. Never include the raw conversation itself — only the distilled substantive content. No status lines, no filler, no side notes, no app branding in anything.

Output a JSON object with this exact schema:
{
  "metadata": { "title": "string", "subtitle": "string", "author": "string", "date": "string", "lang": "ar", "description": "string" },
  "theme": { "mode": "print" },
  "cover": { "title": "string", "subtitle": "string", "icon": "one emoji from the allowed list, chosen to match the document topic", "description": "string" },
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
Allowed cover icons (choose the ONE that best fits the topic): 🤖 AI/agents · 🚀 space · 💻 programming · 🖥️ technology · 💰 money/finance · 🩺 health/medicine · 📚 education · ✈️ travel · 🍳 food/cooking · 🎨 art/design · 🎵 music · 🏋️ sport/fitness · 🌿 nature/environment · ⚖️ law/legal · 🏛️ history · 🧠 mindset/psychology · 🕌 religion · 🧮 math · 🔬 science · 📝 writing/docs · 📊 business/management · 📄 generic document.
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
    const topicText =
      cleaned.find((m) => m.role === 'user')?.content ?? conversationToPrompt(cleaned);
    return {
      metadata: {
        title: parsed.metadata?.title || title,
        subtitle: parsed.metadata?.subtitle,
        author: '',
        date: new Date().toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
          dateStyle: 'long',
          timeStyle: 'short',
        }),
        lang,
        description: parsed.metadata?.description,
      },
      theme: { mode: 'print' },
      cover: parsed.cover
        ? {
            title: parsed.cover.title || parsed.metadata?.title || title,
            subtitle: parsed.cover.subtitle ?? parsed.metadata?.subtitle,
            icon: resolveCoverIcon(parsed.cover.icon, topicText),
            description: parsed.cover.description ?? parsed.metadata?.description,
          }
        : {
            title: parsed.metadata?.title || title,
            icon: resolveCoverIcon(undefined, topicText),
            subtitle: parsed.metadata?.subtitle,
          },
      sections: sanitizeSections(parsed.sections),
    };
  } catch {
    const markdown = referenceMarkdown(cleaned);
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
  return deriveDocumentTitle(undefined, undefined, lang);
}

/** Agent PDFs always print on a white page with the dark-bold print palette. */
function forcePrintSchema(schema: DocumentSchema): DocumentSchema {
  if (schema.theme.mode === 'print') return schema;
  return { ...schema, theme: { ...schema.theme, mode: 'print' } };
}

/**
 * Full agent-driven flow: conversation → organized DocumentSchema → on-device
 * PDF file → native share sheet. Reports short lifecycle statuses via onStatus.
 */
export async function saveConversationAsPdf(
  messages: PdfMessage[],
  opts: AgentPdfOptions = {},
): Promise<PdfOutcome> {
  const lang = opts.lang ?? 'ar';
  const title = opts.title ?? defaultDocTitle(lang);
  const started = Date.now();
  const report: NonNullable<AgentPdfOptions['onStatus']> = (
    phase,
    label,
    current,
    total,
  ) =>
    opts.onStatus?.(phase, label, current, total, {
      percent: pdfPercent(phase, current, total),
      elapsedMs: Date.now() - started,
    });

  report('organizing', lang === 'ar' ? 'جارٍ تنظيم المحتوى…' : 'Organizing content…');

  const schema = await organizeConversation(messages, {
    title,
    lang,
    model: opts.model,
    signal: opts.signal,
  });

  report('building', lang === 'ar' ? 'جارٍ بناء المستند…' : 'Building document…');

  const outcome = await generateDocumentPdf(forcePrintSchema(schema), { mode: 'print' });

  report('rendering', lang === 'ar' ? 'جارٍ إنشاء الملف…' : 'Generating file…');

  if (outcome.files.length === 0) {
    throw new Error('pdf_generation_failed');
  }
  await sharePdf(outcome.files[0].uri);

  report('verifying', lang === 'ar' ? 'جارٍ التحقق…' : 'Verifying…');
  report('done', lang === 'ar' ? 'تم إنشاء الملف' : 'File created');

  return { ...outcome, title: schema.metadata.title };
}

/**
 * Long-form variant of the PDF flow. Routes the conversation through
 * buildLongDocument (sectioned, scalable to 100/500/1000+ pages) instead of
 * the single-shot organizer, then renders/shares exactly like the basic flow.
 */
export async function saveConversationAsLongPdf(
  messages: PdfMessage[],
  opts: AgentPdfOptions = {},
): Promise<PdfOutcome> {
  const lang = opts.lang ?? 'ar';
  const title = opts.title ?? defaultDocTitle(lang);
  const started = Date.now();
  const report: NonNullable<AgentPdfOptions['onStatus']> = (
    phase,
    label,
    current,
    total,
  ) =>
    opts.onStatus?.(phase, label, current, total, {
      percent: pdfPercent(phase, current, total),
      elapsedMs: Date.now() - started,
    });

  report('organizing', lang === 'ar' ? 'جارٍ تنظيم المحتوى…' : 'Organizing content…');

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
    onStatus: (status) => {
      const phase =
        status.phase === 'planning'
          ? 'organizing'
          : status.phase === 'writing'
            ? 'writing'
            : 'building';
      report(phase, status.label, status.current, status.total);
    },
  });

  report('building', lang === 'ar' ? 'جارٍ بناء المستند…' : 'Building document…');

  const outcome = await generateDocumentPdf(forcePrintSchema(schema), { mode: 'print' });

  report('rendering', lang === 'ar' ? 'جارٍ إنشاء الملف…' : 'Generating file…');

  if (outcome.files.length === 0) {
    throw new Error('pdf_generation_failed');
  }
  await sharePdf(outcome.files[0].uri);

  report('verifying', lang === 'ar' ? 'جارٍ التحقق…' : 'Verifying…');
  report('done', lang === 'ar' ? 'تم إنشاء الملف' : 'File created');

  return { ...outcome, title: schema.metadata.title };
}

/* ------------------------------------------------------------------ */
/* Backward-compatible helpers (used by existing screens)              */
/* ------------------------------------------------------------------ */

export async function generatePdf(markdown: string, title: string): Promise<string> {
  const now = new Date();
  const dateLabel = now.toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' });
  const doc = markdownToDocument(markdown, title);
  doc.metadata.date = dateLabel;
  const outcome = await generateDocumentPdf(doc, { mode: 'dark' });
  return outcome.files[0]?.uri;
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
