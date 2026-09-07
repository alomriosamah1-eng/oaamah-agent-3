// Osamah Agent Document Engine — PDF Document Schema & HTML Renderer

export type Content =
  | string
  | {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      highlight?: boolean;
      code?: boolean;
      text: string;
    };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; content: Content[] }
  | { type: "paragraph"; content: Content[] }
  | { type: "list"; ordered: boolean; items: Content[][] }
  | { type: "checklist"; items: { content: Content[]; checked: boolean }[] }
  | {
      type: "table";
      columns: string[];
      rows: Content[][][];
      caption?: string;
    }
  | { type: "card"; title?: string; content: Content[]; accent?: string }
  | {
      type: "callout";
      kind: "note" | "tip" | "warning" | "important";
      content: Content[];
    }
  | { type: "quote"; text: string; author?: string }
  | { type: "code"; language?: string; code: string }
  | {
      type: "stats";
      items: { label: string; value: string; accent?: string }[];
    }
  | {
      type: "comparison";
      title?: string;
      columns: string[];
      rows: Content[][][];
    }
  | {
      type: "timeline";
      items: { title: string; date?: string; content: Content[] }[];
    }
  | { type: "section"; title: string; blocks: Block[] }
  | { type: "hr" };

export interface DocumentSchema {
  metadata: {
    title: string;
    subtitle?: string;
    author?: string;
    date?: string;
    lang: "ar" | "en";
    description?: string;
  };
  theme: { mode: "dark" | "light"; accent?: string };
  cover?: {
    title: string;
    subtitle?: string;
    badge?: string;
    description?: string;
  };
  sections: Block[];
}

export type ThemeTokens = typeof designTokens.dark | typeof designTokens.light;

export const designTokens = {
  dark: {
    background: "#0A0E17",
    surface: "#111827",
    surfaceLight: "#1E293B",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    accent: "#00F0FF",
    accentAlt: "#0070F3",
    border: "rgba(255,255,255,0.12)",
    cardBg: "rgba(31,41,55,0.6)",
    calloutBg: {
      note: "#1E293B",
      tip: "#042F2E",
      warning: "#451A03",
      important: "#3B0764",
    },
    calloutBorder: {
      note: "#38BDF8",
      tip: "#10B981",
      warning: "#F59E0B",
      important: "#7928CA",
    },
    codeBg: "#0F172A",
    codeText: "#E2E8F0",
    tableHeader: "#1E293B",
    tableHeaderText: "#00F0FF",
    tableRowEven: "rgba(31,41,55,0.4)",
    tableBorder: "rgba(255,255,255,0.1)",
    quoteBorder: "#7928CA",
    quoteBg: "rgba(121,40,202,0.08)",
    heading: { h1: "#00F0FF", h2: "#0070F3", h3: "#7928CA", h4: "#FF0080" },
    divider: "rgba(255,255,255,0.08)",
    statsCardBg: "rgba(17,24,39,0.6)",
  },
  light: {
    background: "#FFFFFF",
    surface: "#F8FAFC",
    surfaceLight: "#F1F5F9",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    accent: "#0070F3",
    accentAlt: "#7928CA",
    border: "rgba(0,0,0,0.08)",
    cardBg: "#F8FAFC",
    calloutBg: {
      note: "#EFF6FF",
      tip: "#ECFDF5",
      warning: "#FFFBEB",
      important: "#F5F3FF",
    },
    calloutBorder: {
      note: "#2563EB",
      tip: "#059669",
      warning: "#D97706",
      important: "#9333EA",
    },
    codeBg: "#F1F5F9",
    codeText: "#334155",
    tableHeader: "#1E293B",
    tableHeaderText: "#FFFFFF",
    tableRowEven: "#F8FAFC",
    tableBorder: "#E2E8F0",
    quoteBorder: "#7928CA",
    quoteBg: "#F5F3FF",
    heading: {
      h1: "#0F172A",
      h2: "#1E293B",
      h3: "#374151",
      h4: "#4B5563",
    },
    divider: "#E2E8F0",
    statsCardBg: "#F8FAFC",
  },
} as const;

const CALLOUT_ICONS: Record<string, string> = {
  note: "📘",
  tip: "💡",
  warning: "⚠️",
  important: "❗",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wrapInline(content: Content[], tokens: ThemeTokens): string {
  return renderContent(content, tokens);
}

export function renderContent(
  content: Content[],
  tokens: ThemeTokens
): string {
  return content
    .map((fragment) => {
      if (typeof fragment === "string") {
        return `<span>${escapeHtml(fragment)}</span>`;
      }
      let html = escapeHtml(fragment.text);
      if (fragment.code) {
        return `<code style="background:${tokens.codeBg};color:${tokens.codeText};padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:'Courier New',monospace">${html}</code>`;
      }
      if (fragment.bold) html = `<strong>${html}</strong>`;
      if (fragment.italic) html = `<em>${html}</em>`;
      if (fragment.underline) html = `<u>${html}</u>`;
      if (fragment.highlight)
        html = `<mark style="background:${tokens.accent};color:${tokens.background};padding:1px 4px;border-radius:3px">${html}</mark>`;
      return `<span>${html}</span>`;
    })
    .join("");
}

export function renderBlock(block: Block, tokens: ThemeTokens): string {
  switch (block.type) {
    case "heading": {
      const tag = `h${block.level}`;
      const color = tokens.heading[`h${block.level}` as keyof typeof tokens.heading];
      const sizes: Record<number, string> = {
        1: "2em",
        2: "1.6em",
        3: "1.3em",
        4: "1.1em",
      };
      return `<${tag} style="color:${color};font-size:${sizes[block.level]};font-weight:700;margin:1.2em 0 0.5em;line-height:1.3">${wrapInline(block.content, tokens)}</${tag}>`;
    }

    case "paragraph":
      return `<p style="margin:0.6em 0;line-height:1.8;color:${tokens.textPrimary};font-size:1em">${wrapInline(block.content, tokens)}</p>`;

    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map(
          (item) =>
            `<li style="margin:0.3em 0;line-height:1.7;color:${tokens.textPrimary}">${wrapInline(item, tokens)}</li>`
        )
        .join("");
      return `<${tag} style="padding-${tokens === designTokens.dark ? "right" : "left"}:1.5em;margin:0.5em 0">${items}</${tag}>`;
    }

    case "checklist": {
      const items = block.items
        .map((item) => {
          const icon = item.checked
            ? `<span style="color:#10B981;font-size:1.1em">☑</span>`
            : `<span style="color:${tokens.textSecondary};font-size:1.1em">☐</span>`;
          const strike = item.checked
            ? "text-decoration:line-through;opacity:0.6"
            : "";
          return `<li style="margin:0.4em 0;line-height:1.7;color:${tokens.textPrimary};list-style:none;display:flex;align-items:flex-start;gap:8px;${strike}">${icon}<span>${wrapInline(item.content, tokens)}</span></li>`;
        })
        .join("");
      return `<ul style="padding:0;margin:0.5em 0">${items}</ul>`;
    }

    case "table": {
      const headerCells = block.columns
        .map(
          (col) =>
            `<th style="background:${tokens.tableHeader};color:${tokens.tableHeaderText};padding:10px 14px;font-weight:600;text-align:right;font-size:0.9em;border-bottom:2px solid ${tokens.accent}">${escapeHtml(col)}</th>`
        )
        .join("");
      const bodyRows = block.rows
        .map((row, ri) => {
          const bg = ri % 2 === 0 ? "transparent" : tokens.tableRowEven;
          const cells = row
            .map(
              (cell) =>
                `<td style="padding:9px 14px;border-bottom:1px solid ${tokens.tableBorder};background:${bg};color:${tokens.textPrimary};font-size:0.9em">${wrapInline(cell, tokens)}</td>`
            )
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      const caption = block.caption
        ? `<caption style="text-align:right;color:${tokens.textSecondary};font-size:0.85em;margin-bottom:6px">${escapeHtml(block.caption)}</caption>`
        : "";
      return `<table style="width:100%;border-collapse:collapse;margin:0.8em 0;border:1px solid ${tokens.tableBorder};border-radius:8px;overflow:hidden;direction:rtl">${caption}<thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }

    case "card": {
      const accentColor = block.accent || tokens.accent;
      const titleHtml = block.title
        ? `<div style="font-weight:700;font-size:1.05em;color:${tokens.textPrimary};margin-bottom:8px">${escapeHtml(block.title)}</div>`
        : "";
      return `<div style="background:${tokens.cardBg};border:1px solid ${tokens.border};border-right:4px solid ${accentColor};border-radius:10px;padding:16px 20px;margin:0.8em 0;backdrop-filter:blur(8px)">${titleHtml}<div style="color:${tokens.textPrimary};line-height:1.7">${wrapInline(block.content, tokens)}</div></div>`;
    }

    case "callout": {
      const bg = tokens.calloutBg[block.kind];
      const border = tokens.calloutBorder[block.kind];
      const icon = CALLOUT_ICONS[block.kind];
      return `<div style="background:${bg};border-right:4px solid ${border};border-radius:8px;padding:14px 18px;margin:0.8em 0;display:flex;gap:10px;align-items:flex-start"><span style="font-size:1.2em;flex-shrink:0">${icon}</span><div style="color:${tokens.textPrimary};line-height:1.7">${wrapInline(block.content, tokens)}</div></div>`;
    }

    case "quote": {
      const authorHtml = block.author
        ? `<footer style="color:${tokens.textSecondary};font-size:0.85em;margin-top:8px;text-align:left">— ${escapeHtml(block.author)}</footer>`
        : "";
      return `<blockquote style="border-right:4px solid ${tokens.quoteBorder};background:${tokens.quoteBg};margin:0.8em 0;padding:14px 20px;border-radius:0 8px 8px 0"><p style="margin:0;color:${tokens.textPrimary};font-style:italic;line-height:1.7;font-size:1.05em">${escapeHtml(block.text)}</p>${authorHtml}</blockquote>`;
    }

    case "code": {
      const langLabel = block.language
        ? `<div style="background:${tokens.surfaceLight};color:${tokens.textSecondary};padding:6px 14px;font-size:0.75em;font-family:monospace;border-bottom:1px solid ${tokens.border};border-radius:8px 8px 0 0">${escapeHtml(block.language)}</div>`
        : "";
      const radius = block.language ? "0 0 8px 8px" : "8px";
      return `<div style="margin:0.8em 0">${langLabel}<pre style="background:${tokens.codeBg};color:${tokens.codeText};padding:16px;margin:0;border-radius:${radius};overflow-x:auto;font-size:0.88em;line-height:1.6;font-family:'Courier New',monospace;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-word"><code>${escapeHtml(block.code)}</code></pre></div>`;
    }

    case "stats": {
      const cards = block.items
        .map((stat) => {
          const ac = stat.accent || tokens.accent;
          return `<div style="background:${tokens.statsCardBg};border:1px solid ${tokens.border};border-radius:10px;padding:16px;text-align:center;flex:1;min-width:120px"><div style="font-size:1.8em;font-weight:800;color:${ac};line-height:1.2">${escapeHtml(stat.value)}</div><div style="font-size:0.82em;color:${tokens.textSecondary};margin-top:4px">${escapeHtml(stat.label)}</div></div>`;
        })
        .join("");
      return `<div style="display:flex;gap:12px;margin:0.8em 0;flex-wrap:wrap">${cards}</div>`;
    }

    case "comparison": {
      const titleHtml = block.title
        ? `<div style="font-weight:700;font-size:1.05em;color:${tokens.textPrimary};margin-bottom:8px">${escapeHtml(block.title)}</div>`
        : "";
      const headerCells = block.columns
        .map(
          (col) =>
            `<th style="background:${tokens.tableHeader};color:${tokens.tableHeaderText};padding:10px 14px;font-weight:600;text-align:right;border-bottom:2px solid ${tokens.accent}">${escapeHtml(col)}</th>`
        )
        .join("");
      const bodyRows = block.rows
        .map((row, ri) => {
          const bg = ri % 2 === 0 ? "transparent" : tokens.tableRowEven;
          const cells = row
            .map(
              (cell) =>
                `<td style="padding:9px 14px;border-bottom:1px solid ${tokens.tableBorder};background:${bg};color:${tokens.textPrimary}">${wrapInline(cell, tokens)}</td>`
            )
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `${titleHtml}<table style="width:100%;border-collapse:collapse;margin:0.6em 0;border:1px solid ${tokens.tableBorder};border-radius:8px;overflow:hidden;direction:rtl"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }

    case "timeline": {
      const items = block.items
        .map((item) => {
          const dateHtml = item.date
            ? `<span style="color:${tokens.accent};font-size:0.8em;font-weight:600">${escapeHtml(item.date)}</span>`
            : "";
          return `<div style="display:flex;gap:14px;position:relative;padding-bottom:20px"><div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0"><div style="width:10px;height:10px;border-radius:50%;background:${tokens.accent};box-shadow:0 0 8px ${tokens.accent};flex-shrink:0;margin-top:4px"></div><div style="width:2px;flex:1;background:${tokens.border};margin-top:4px"></div></div><div style="flex:1"><div style="font-weight:700;color:${tokens.textPrimary};font-size:0.95em">${escapeHtml(item.title)}</div>${dateHtml}<div style="color:${tokens.textPrimary};line-height:1.7;margin-top:4px">${wrapInline(item.content, tokens)}</div></div></div>`;
        })
        .join("");
      return `<div style="margin:0.8em 0;padding-right:4px">${items}</div>`;
    }

    case "section": {
      const nested = renderBlocks(block.blocks, tokens);
      return `<div style="margin:1em 0"><div style="font-size:1.3em;font-weight:700;color:${tokens.accent};margin-bottom:0.6em;padding-bottom:6px;border-bottom:2px solid ${tokens.border}">${escapeHtml(block.title)}</div>${nested}</div>`;
    }

    case "hr":
      return `<hr style="border:none;border-top:1px solid ${tokens.divider};margin:1.5em 0" />`;

    default:
      return "";
  }
}

export function renderBlocks(
  blocks: Block[],
  tokens: ThemeTokens
): string {
  return blocks.map((b) => renderBlock(b, tokens)).join("\n");
}

export function renderCoverPage(
  cover: NonNullable<DocumentSchema["cover"]>,
  tokens: ThemeTokens,
  metadata: DocumentSchema["metadata"]
): string {
  const badgeHtml = cover.badge
    ? `<div style="color:${tokens.accent};font-size:1.1em;font-weight:700;letter-spacing:2px;margin-bottom:24px">${escapeHtml(cover.badge)}</div>`
    : "";
  const subtitleHtml = cover.subtitle
    ? `<div style="color:${tokens.textSecondary};font-size:1.15em;margin-top:12px;line-height:1.6">${escapeHtml(cover.subtitle)}</div>`
    : "";
  const descHtml = cover.description
    ? `<div style="color:${tokens.textSecondary};font-size:0.95em;margin-top:20px;max-width:400px;line-height:1.6">${escapeHtml(cover.description)}</div>`
    : "";
  const metaParts: string[] = [];
  if (metadata.author) metaParts.push(escapeHtml(metadata.author));
  if (metadata.date) metaParts.push(escapeHtml(metadata.date));
  const metaHtml = metaParts.length
    ? `<div style="color:${tokens.textSecondary};font-size:0.85em;margin-top:auto;padding-top:40px">${metaParts.join(" · ")}</div>`
    : "";

  return `
<div style="page-break-after:always;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:${tokens.background};position:relative;overflow:hidden;direction:rtl">
  <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${tokens.accent},${tokens.accentAlt},${tokens.quoteBorder})"></div>
  <div style="position:absolute;top:60px;right:60px;width:120px;height:120px;border:2px solid ${tokens.border};border-radius:50%;opacity:0.15"></div>
  <div style="position:absolute;bottom:80px;left:40px;width:80px;height:80px;border:2px solid ${tokens.accent};border-radius:12px;opacity:0.1;transform:rotate(45deg)"></div>
  <div style="position:absolute;top:40%;left:20px;width:60px;height:60px;border:1px solid ${tokens.quoteBorder};border-radius:50%;opacity:0.1"></div>
  <div style="position:absolute;bottom:30%;right:30px;width:40px;height:40px;background:${tokens.accent};opacity:0.04;transform:rotate(45deg)"></div>
  ${badgeHtml}
  <div style="font-size:2.4em;font-weight:800;color:${tokens.accent};line-height:1.3;max-width:600px">${escapeHtml(cover.title)}</div>
  ${subtitleHtml}
  ${descHtml}
  <div style="width:60px;height:3px;background:${tokens.accent};border-radius:2px;margin-top:28px;opacity:0.6"></div>
  ${metaHtml}
  <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${tokens.accentAlt},${tokens.accent},${tokens.quoteBorder})"></div>
</div>`;
}

export function buildDocumentHtml(schema: DocumentSchema): string {
  const tokens =
    schema.theme.mode === "dark" ? designTokens.dark : designTokens.light;
  const dir = schema.metadata.lang === "ar" ? "rtl" : "ltr";
  const fontFamily =
    schema.metadata.lang === "ar"
      ? "'Noto Sans Arabic', 'Segoe UI', 'DejaVu Sans', Arial, sans-serif"
      : "'Inter', 'Segoe UI', 'DejaVu Sans', Arial, sans-serif";

  const coverHtml = schema.cover
    ? renderCoverPage(schema.cover, tokens, schema.metadata)
    : "";

  const contentHtml = renderBlocks(schema.sections, tokens);

  return `<!DOCTYPE html>
<html lang="${schema.metadata.lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(schema.metadata.title)}</title>
<style>
  @page {
    margin: 1.5cm;
    @top-right {
      content: counter(page);
      font-size: 10px;
      color: ${tokens.textSecondary};
      font-family: ${fontFamily};
    }
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: ${fontFamily};
    background: ${tokens.background};
    color: ${tokens.textPrimary};
    direction: ${dir};
    unicode-bidi: plaintext;
    text-align: ${dir === "rtl" ? "right" : "left"};
    line-height: 1.7;
    font-size: 15px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  h1, h2, h3, h4, h5, h6 {
    direction: ${dir};
    unicode-bidi: plaintext;
    text-align: ${dir === "rtl" ? "right" : "left"};
  }

  p, li, td, th, blockquote, div {
    direction: ${dir};
    unicode-bidi: plaintext;
  }

  @media print {
    body { background: ${tokens.background}; }
    .page-break { page-break-after: always; }
  }
</style>
</head>
<body>
${coverHtml}
${contentHtml}
<div style="margin-top:3em;padding:16px 0;border-top:1px solid ${tokens.divider};text-align:center;color:${tokens.textSecondary};font-size:0.78em;direction:rtl;unicode-bidi:plaintext">
  وكيل أسامة — تم الإنشاء على الجهاز
</div>
</body>
</html>`;
}

export function markdownToDocument(
  markdown: string,
  title: string
): DocumentSchema {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({
        type: "code",
        language: lang || undefined,
        code: codeLines.join("\n"),
      });
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        content: [headingMatch[2].trim()],
      });
      i++;
      continue;
    }

    if (line.startsWith("---") || line.startsWith("***")) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const tableMatch = line.match(/^\|(.+)\|$/);
    if (tableMatch) {
      const columns = line
        .split("|")
        .filter((c) => c.trim())
        .map((c) => c.trim());
      i++;
      if (i < lines.length && lines[i].match(/^\|[\s\-:|]+\|$/)) {
        i++;
      }
      const rows: Content[][][] = [];
      while (i < lines.length && lines[i].match(/^\|.+\|$/)) {
        const cells = lines[i]
          .split("|")
          .filter((c) => c.trim())
          .map((c) => [c.trim()] as Content[]);
        rows.push(cells);
        i++;
      }
      blocks.push({ type: "table", columns, rows });
      continue;
    }

    const unorderedListMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
    if (unorderedListMatch && !line.match(/^\[[ x]\]/)) {
      const items: Content[][] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*+]\s+(.+)/)) {
        const m = lines[i].match(/^[\s]*[-*+]\s+(.+)/);
        if (m) items.push([m[1].trim()]);
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    const orderedListMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);
    if (orderedListMatch) {
      const items: Content[][] = [];
      while (i < lines.length && lines[i].match(/^[\s]*\d+[.)]\s+(.+)/)) {
        const m = lines[i].match(/^[\s]*\d+[.)]\s+(.+)/);
        if (m) items.push([m[1].trim()]);
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const checkboxMatch = line.match(/^[\s]*- \[([ x])\]\s+(.+)/);
    if (checkboxMatch) {
      const items: { content: Content[]; checked: boolean }[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*- \[([ x])\]\s+(.+)/)) {
        const m = lines[i].match(/^[\s]*- \[([ x])\]\s+(.+)/);
        if (m)
          items.push({ content: [m[2].trim()], checked: m[1] === "x" });
        i++;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }

    const blockquoteMatch = line.match(/^>\s*(.+)/);
    if (blockquoteMatch) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].match(/^>\s*(.+)/)) {
        const m = lines[i].match(/^>\s*(.+)/);
        if (m) quoteLines.push(m[1]);
        i++;
      }
      const lastLine = quoteLines[quoteLines.length - 1];
      let author: string | undefined;
      let text = quoteLines.join("\n");
      const authorMatch = lastLine?.match(/^—\s*(.+)/);
      if (authorMatch) {
        author = authorMatch[1].trim();
        text = quoteLines.slice(0, -1).join("\n").trim();
      }
      blocks.push({ type: "quote", text, author });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !lines[i].match(/^\|/) &&
      !lines[i].match(/^[-*+]\s/) &&
      !lines[i].match(/^\d+[.)]\s/) &&
      !lines[i].startsWith("---") &&
      !lines[i].startsWith("***")
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", content: [paragraphLines.join(" ")] });
    }
  }

  return {
    metadata: {
      title,
      lang: "ar",
    },
    theme: { mode: "dark" },
    sections: blocks,
  };
}

export function documentToMarkdown(doc: DocumentSchema): string {
  const parts: string[] = [];

  parts.push(`# ${doc.metadata.title}`);
  if (doc.metadata.subtitle)
    parts.push(`> ${doc.metadata.subtitle}`);
  if (doc.metadata.author || doc.metadata.date) {
    const meta = [doc.metadata.author, doc.metadata.date]
      .filter(Boolean)
      .join(" · ");
    parts.push(`> ${meta}`);
  }
  parts.push("");

  function blocksToMarkdown(blocks: Block[]): string {
    return blocks
      .map((block) => {
        switch (block.type) {
          case "heading": {
            const prefix = "#".repeat(block.level);
            return `${prefix} ${contentToMd(block.content)}`;
          }
          case "paragraph":
            return contentToMd(block.content);
          case "list": {
            return block.items
              .map((item, idx) => {
                const bullet = block.ordered ? `${idx + 1}.` : "-";
                return `${bullet} ${contentToMd(item)}`;
              })
              .join("\n");
          }
          case "checklist":
            return block.items
              .map((item) => {
                const check = item.checked ? "x" : " ";
                return `- [${check}] ${contentToMd(item.content)}`;
              })
              .join("\n");
          case "table": {
            const header = `| ${block.columns.join(" | ")} |`;
            const sep = `| ${block.columns.map(() => "---").join(" | ")} |`;
            const rows = block.rows
              .map(
                (row) =>
                  `| ${row.map((cell) => contentToMd(cell)).join(" | ")} |`
              )
              .join("\n");
            return `${header}\n${sep}\n${rows}`;
          }
          case "card": {
            const title = block.title ? `**${block.title}**\n\n` : "";
            return `${title}${contentToMd(block.content)}`;
          }
          case "callout":
            return `> ${CALLOUT_ICONS[block.kind]} **${block.kind.charAt(0).toUpperCase() + block.kind.slice(1)}**: ${contentToMd(block.content)}`;
          case "quote": {
            const author = block.author ? `\n> — ${block.author}` : "";
            return `> ${block.text}${author}`;
          }
          case "code": {
            const lang = block.language || "";
            return `\`\`\`${lang}\n${block.code}\n\`\`\``;
          }
          case "stats":
            return block.items
              .map((s) => `**${s.value}** ${s.label}`)
              .join(" | ");
          case "comparison": {
            const title = block.title ? `**${block.title}**\n\n` : "";
            const header = `| ${block.columns.join(" | ")} |`;
            const sep = `| ${block.columns.map(() => "---").join(" | ")} |`;
            const rows = block.rows
              .map(
                (row) =>
                  `| ${row.map((cell) => contentToMd(cell)).join(" | ")} |`
              )
              .join("\n");
            return `${title}${header}\n${sep}\n${rows}`;
          }
          case "timeline":
            return block.items
              .map((item) => {
                const date = item.date ? ` (${item.date})` : "";
                return `- **${item.title}**${date}\n  ${contentToMd(item.content)}`;
              })
              .join("\n");
          case "section": {
            const nested = blocksToMarkdown(block.blocks);
            return `## ${block.title}\n\n${nested}`;
          }
          case "hr":
            return "---";
          default:
            return "";
        }
      })
      .join("\n\n");
  }

  function contentToMd(content: Content[]): string {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        let text = c.text;
        if (c.bold) text = `**${text}**`;
        if (c.italic) text = `*${text}*`;
        if (c.underline) text = `<u>${text}</u>`;
        if (c.highlight) text = `==${text}==`;
        if (c.code) text = `\`${text}\``;
        return text;
      })
      .join("");
  }

  parts.push(blocksToMarkdown(doc.sections));
  return parts.join("\n");
}

export function generateCoverHtml(
  title: string,
  subtitle: string,
  date: string,
  lang: "ar" | "en"
): string {
  const tokens = designTokens.dark;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const fontFamily =
    lang === "ar"
      ? "'Noto Sans Arabic', 'Segoe UI', 'DejaVu Sans', Arial, sans-serif"
      : "'Inter', 'Segoe UI', 'DejaVu Sans', Arial, sans-serif";

  const subtitleHtml = subtitle
    ? `<div style="color:${tokens.textSecondary};font-size:1.15em;margin-top:12px;line-height:1.6">${escapeHtml(subtitle)}</div>`
    : "";

  const dateHtml = date
    ? `<div style="color:${tokens.textSecondary};font-size:0.85em;margin-top:auto;padding-top:40px">${escapeHtml(date)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 1.5cm; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ${fontFamily};
    background: ${tokens.background};
    color: ${tokens.textPrimary};
    direction: ${dir};
    unicode-bidi: plaintext;
    text-align: center;
    -webkit-font-smoothing: antialiased;
  }
</style>
</head>
<body>
<div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden">
  <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${tokens.accent},${tokens.accentAlt},${tokens.quoteBorder})"></div>
  <div style="position:absolute;top:60px;right:60px;width:120px;height:120px;border:2px solid ${tokens.border};border-radius:50%;opacity:0.15"></div>
  <div style="position:absolute;bottom:80px;left:40px;width:80px;height:80px;border:2px solid ${tokens.accent};border-radius:12px;opacity:0.1;transform:rotate(45deg)"></div>
  <div style="position:absolute;top:40%;left:20px;width:60px;height:60px;border:1px solid ${tokens.quoteBorder};border-radius:50%;opacity:0.1"></div>
  <div style="color:${tokens.accent};font-size:1.1em;font-weight:700;letter-spacing:2px;margin-bottom:24px">وكيل أسامة</div>
  <div style="font-size:2.4em;font-weight:800;color:${tokens.accent};line-height:1.3;max-width:600px">${escapeHtml(title)}</div>
  ${subtitleHtml}
  <div style="width:60px;height:3px;background:${tokens.accent};border-radius:2px;margin-top:28px;opacity:0.6"></div>
  ${dateHtml}
  <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${tokens.accentAlt},${tokens.accent},${tokens.quoteBorder})"></div>
</div>
</body>
</html>`;
}
