import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { storage } from '@/utils/Storage';

/**
 * On-device PDF generation for the conversation archive.
 * The markdown is rendered to RTL-aware HTML and printed to a PDF on the phone
 * itself (expo-print). A best-effort archive attempt is also made against a
 * reachable server when one is configured — failures are silently ignored.
 */

/* ------------------------------------------------------------------ */
/* Markdown → HTML (port of the reference renderer, standalone)        */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text: string): string {
  return escapeHtml(text).replace(
    /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g,
    (_match, _all, boldInner, uInner, italicInner, codeInner, linkText, linkUrl) => {
      if (boldInner !== undefined) return `<strong>${inline(boldInner)}</strong>`;
      if (uInner !== undefined) return `<u>${inline(uInner)}</u>`;
      if (italicInner !== undefined) return `<em>${inline(italicInner)}</em>`;
      if (codeInner !== undefined) return `<code>${inline(codeInner)}</code>`;
      if (linkText !== undefined) return `<a href="${escapeHtml(linkUrl)}">${inline(linkText)}</a>`;
      return '';
    },
  );
}

interface TableAcc {
  headers: string[];
  rows: string[][];
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let paragraph: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listBuf: string[] = [];
  let quoteBuf: string[] = [];
  let table: TableAcc | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listType && listBuf.length > 0) {
      const tag = listType === 'ul' ? 'ul' : 'ol';
      out.push(`<${tag}>${listBuf.map((li) => `<li>${inline(li)}</li>`).join('')}</${tag}>`);
    }
    listType = null;
    listBuf = [];
  };
  const flushQuote = () => {
    if (quoteBuf.length > 0) {
      out.push(`<blockquote>${quoteBuf.map((q) => `<p>${inline(q)}</p>`).join('')}</blockquote>`);
      quoteBuf = [];
    }
  };
  const flushTable = () => {
    if (table) {
      const thead = `<thead><tr>${table.headers.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${table.rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      table = null;
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
    flushTable();
  };

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (inCode) {
      if (/^\s*(```|~~~)/.test(line)) {
        inCode = false;
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
      } else {
        codeBuf.push(raw);
      }
      continue;
    }

    if (/^\s*(```|~~~)/.test(line)) {
      flushAll();
      inCode = true;
      continue;
    }

    if (!line) {
      flushAll();
      continue;
    }

    // Table separator
    if (isTableSeparator(line)) {
      if (table && table.rows.length === 0) {
        table.headers = splitTableRow(table.headers.join('|'));
        continue;
      }
    }

    // Table row
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      const cells = splitTableRow(line);
      if (!table) table = { headers: cells, rows: [] };
      else table.rows.push(cells);
      continue;
    }

    flushTable();

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushAll();
      out.push('<hr />');
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      flushTable();
      quoteBuf.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();

    // Unordered list
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      flushParagraph();
      flushTable();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listBuf.push(ul[1]);
      continue;
    }

    // Ordered list
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flushParagraph();
      flushTable();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listBuf.push(ol[1]);
      continue;
    }
    flushList();

    paragraph.push(line);
  }

  flushAll();
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* HTML document wrapper (RTL, dark-read-friendly print palette)        */
/* ------------------------------------------------------------------ */

const CSS = `
  * { box-sizing: border-box; }
  html { direction: rtl; }
  body {
    font-family: -apple-system, 'Segoe UI', 'Noto Sans Arabic', 'DejaVu Sans', sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1f2937;
    direction: rtl;
    unicode-bidi: plaintext;
    text-align: right;
    padding: 24px;
  }
  .head { text-align: center; margin-bottom: 18px; }
  .head h1 { font-size: 18pt; color: #111827; margin: 4px 0; }
  .head .meta { font-size: 9pt; color: #6b7280; }
  h1, h2, h3, h4, h5, h6 { color: #4338ca; line-height: 1.4; margin: 14px 0 6px 0; }
  h1 { font-size: 16pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h2 { font-size: 13.5pt; }
  h3 { font-size: 12pt; }
  p { margin: 0 0 8px 0; }
  strong { color: #111827; }
  a { color: #4338ca; text-decoration: none; }
  ul, ol { margin: 0 0 8px 0; padding-right: 18px; }
  li { margin-bottom: 2px; }
  blockquote { border-right: 3px solid #4338ca; background: #eef2ff; margin: 0 0 8px 0; padding: 6px 12px; color: #374151; }
  code { font-family: 'DejaVu Sans Mono', monospace; font-size: 9.5pt; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
  pre { background: #0f172a; color: #e2e8f0; padding: 10px; border-radius: 6px; overflow: hidden; direction: ltr; text-align: left; }
  pre code { background: transparent; color: inherit; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 10px 0; }
  th, td { border: 0.6px solid #d1d5db; padding: 5px 8px; font-size: 10pt; }
  th { background: #eef2ff; color: #3730a3; font-weight: 700; }
  tr:nth-child(even) td { background: #f9fafb; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
  .footer-note { text-align: center; font-size: 8pt; color: #9ca3af; margin-top: 18px; }
`;

export function markdownToPdfHtml(markdown: string, meta: { title: string; dateLabel: string }): string {
  return `<!doctype html>
<html lang="ar">
<head>
  <meta charset="utf-8" />
  <style>${CSS}</style>
</head>
<body>
  <div class="head">
    <h1>${escapeHtml(meta.title)}</h1>
    <div class="meta">${escapeHtml(meta.dateLabel)}</div>
  </div>
  ${markdownToHtml(markdown)}
  <div class="footer-note">© 2026 Osamah agent — تم الإنشاء على الجهاز</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Conversation → markdown                                              */
/* ------------------------------------------------------------------ */

export interface PdfMessage {
  role: 'user' | 'bot' | string | number;
  content: string;
}

export function messagesToMarkdown(messages: PdfMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || m.content.trim() === '') continue;
    const label = m.role === 'user' ? 'المستخدم' : 'الوكيل';
    parts.push(`### ${label}\n\n${m.content}`);
  }
  return parts.join('\n\n');
}

/* ------------------------------------------------------------------ */
/* PDF generation                                                      */
/* ------------------------------------------------------------------ */

export async function generatePdf(markdown: string, title: string): Promise<string> {
  const now = new Date();
  const dateLabel = now.toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' });
  const html = markdownToPdfHtml(markdown, { title, dateLabel });
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

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

/** Full flow: markdown → PDF file → native share sheet. */
export async function saveMarkdownAsPdf(markdown: string, title: string): Promise<string> {
  const uri = await generatePdf(markdown, title);
  await sharePdf(uri);
  return uri;
}

/* ------------------------------------------------------------------ */
/* Best-effort server archive (mirrors the reference's tolerance)       */
/* ------------------------------------------------------------------ */

/**
 * Tries to archive the document to a reachable server when one is configured
 * (stored `serverUrl`). Failures are silently ignored — PDF still works fully
 * on-device. Returns the archived document id when the server accepted it.
 */
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

/** True when the current platform supports on-device PDF printing. */
export function pdfSupportedOnPlatform(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}