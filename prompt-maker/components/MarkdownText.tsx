// Prompt Maker — lightweight Markdown renderer (read-only, no external deps).
// Supports headings, paragraphs, bold/italic/inline code, code blocks, bullet
// and numbered lists, tables, blockquotes and horizontal rules — everything a
// Prompt Viewer needs without pulling a render-library dependency.

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { withAlpha } from '@/theme/colors';
import { typography } from '@/theme/typography';

type InlinePart = { type: 'text' | 'bold' | 'italic' | 'code'; value: string };

function parseInline(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: line.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('`')) parts.push({ type: 'code', value: tok.slice(1, -1) });
    else if (tok.startsWith('**')) parts.push({ type: 'bold', value: tok.slice(2, -2) });
    else parts.push({ type: 'italic', value: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < line.length) parts.push({ type: 'text', value: line.slice(last) });
  return parts;
}

type Block =
  | { type: 'h'; level: number; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'code'; code: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'hr' };

function parseBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  const pushLine = (raw: string | undefined, type: 'p' | 'h' = 'p', level = 0) => {
    if (raw == null) return;
    const t = raw.trim();
    if (!t) return;
    if (t === '---' || /^[-*_]{3,}$/.test(t)) {
      blocks.push({ type: 'hr' });
      return;
    }
    if (type === 'h') {
      blocks.push({ type: 'h', level, text: t.replace(/^#{1,6}\s*/, '') });
      return;
    }
    blocks.push({ type: 'p', text: t });
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      i += 1;
      continue;
    }

    // Fenced code block
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ type: 'code', code: buf.join('\n').trim() });
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ type: 'h', level: h[1].length, text: h[2] });
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      blocks.push({ type: 'quote', text: line.replace(/^>\s?/, '') });
      i += 1;
      continue;
    }

    // Table: header row, separator next
    if (line.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const header = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*•]\s+(.*)$/);
    if (ul) {
      const items: string[] = [ul[1]];
      i += 1;
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      const items: string[] = [ol[1]];
      i += 1;
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    pushLine(raw);
    i += 1;
  }

  return blocks;
}

function parseRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

const Inline = ({ parts, baseStyle }: { parts: InlinePart[]; baseStyle: object }) => {
  const { colors } = useTheme();
  return (
    <Text style={baseStyle}>
      {parts.map((part, idx) => {
        if (part.type === 'bold') {
          return (
            <Text key={idx} style={[baseStyle, { fontWeight: '700' }]}>
              {part.value}
            </Text>
          );
        }
        if (part.type === 'italic') {
          return (
            <Text key={idx} style={[baseStyle, { fontStyle: 'italic' }]}>
              {part.value}
            </Text>
          );
        }
        if (part.type === 'code') {
          return (
            <Text key={idx} style={[baseStyle, { fontFamily: 'monospace' as any, color: colors.primary }]}>
              {part.value}
            </Text>
          );
        }
        return <Text key={idx}>{part.value}</Text>;
      })}
    </Text>
  );
};

const MarkdownText = ({ text, scrollable = false }: { text: string; scrollable?: boolean }) => {
  const { colors } = useTheme();
  const blocks = parseBlocks(text);

  const content = (
    <>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h':
            return (
              <Text
                key={idx}
                style={[
                  block.level <= 2 ? typography.titleLarge : typography.titleMedium,
                  { color: colors.onSurface, marginTop: 10, marginBottom: 4 },
                ]}>
                {block.text}
              </Text>
            );
          case 'p':
            return (
              <Inline
                key={idx}
                parts={parseInline(block.text)}
                baseStyle={{ color: colors.onSurface, ...(typography.bodyMedium as any), marginTop: 4, marginBottom: 4 }}
              />
            );
          case 'ul':
            return (
              <View key={idx} style={{ marginTop: 4, marginBottom: 4 }}>
                {block.items.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 6, marginVertical: 1 }}>
                    <Text style={{ color: colors.primary, fontSize: 14, lineHeight: 20 }}>•</Text>
                    <Inline parts={parseInline(item)} baseStyle={{ flex: 1, color: colors.onSurface, ...(typography.bodyMedium as any) }} />
                  </View>
                ))}
              </View>
            );
          case 'ol':
            return (
              <View key={idx} style={{ marginTop: 4, marginBottom: 4 }}>
                {block.items.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 6, marginVertical: 1 }}>
                    <Text style={{ color: colors.primary, fontSize: 14, lineHeight: 20 }}>{j + 1}.</Text>
                    <Inline parts={parseInline(item)} baseStyle={{ flex: 1, color: colors.onSurface, ...(typography.bodyMedium as any) }} />
                  </View>
                ))}
              </View>
            );
          case 'code':
            return (
              <View
                key={idx}
                style={{
                  backgroundColor: withAlpha(colors.primary, 0.08),
                  borderColor: withAlpha(colors.primary, 0.25),
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 10,
                  marginVertical: 6,
                }}>
                {block.code.split('\n').map((line, j) => (
                  <Text
                    key={j}
                    style={{ color: colors.primary, fontFamily: 'monospace' as any, fontSize: 13, lineHeight: 19 }}>
                    {line}
                  </Text>
                ))}
              </View>
            );
          case 'table': {
            const widths = [0.33, 0.67];
            return (
              <View key={idx} style={{ borderRadius: 10, borderColor: withAlpha(colors.onSurfaceVariant, 0.3), borderWidth: 1, overflow: 'hidden', marginVertical: 6 }}>
                <View style={{ flexDirection: 'row', backgroundColor: withAlpha(colors.primary, 0.12) }}>
                  {block.header.map((cell, ci) => (
                    <View key={ci} style={{ flex: ci === 0 ? widths[0] : widths[1], padding: 6 }}>
                      <Inline parts={parseInline(cell)} baseStyle={{ color: colors.primary, fontWeight: '700' as any, fontSize: 13 }} />
                    </View>
                  ))}
                </View>
                {block.rows.map((row, ri) => (
                  <View key={ri} style={{ flexDirection: 'row', borderTopColor: withAlpha(colors.onSurfaceVariant, 0.2), borderTopWidth: 1 }}>
                    {row.map((cell, ci) => (
                      <View key={ci} style={{ flex: ci === 0 ? widths[0] : widths[1], padding: 6 }}>
                        <Inline parts={parseInline(cell)} baseStyle={{ color: colors.onSurface, fontSize: 13 }} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          }
          case 'quote':
            return (
              <View
                key={idx}
                style={{
                  borderLeftColor: colors.primary,
                  borderLeftWidth: 3,
                  paddingLeft: 10,
                  paddingVertical: 2,
                  marginVertical: 4,
                }}>
                <Inline parts={parseInline(block.text)} baseStyle={{ color: colors.onSurfaceVariant, fontStyle: 'italic' as any }} />
              </View>
            );
          case 'hr':
            return (
              <View
                key={idx}
                style={{ height: 1, backgroundColor: withAlpha(colors.onSurfaceVariant, 0.25), marginVertical: 8 }}
              />
            );
        }
        return null;
      })}
    </>
  );

  if (scrollable) return <ScrollView style={styles.scroll}>{content}</ScrollView>;
  return content;
};

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
});

export default MarkdownText;