// Document schema: markdown parsing, HTML rendering, tokens.
import {
  buildDocumentHtml,
  designTokens,
  DocumentSchema,
  documentToMarkdown,
  markdownToDocument,
  tokensForMode,
} from '../utils/documentSchema';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('documentSchema');

test('markdownToDocument: parses the supported block types', () => {
  const md = [
    '# عنوان رئيسي',
    '',
    'فقرة نصية واحدة.',
    '',
    '- عنصر أول',
    '- عنصر ثان',
    '',
    '```ts',
    'const a = 1;',
    '```',
    '',
    '| أ | ب |',
    '|---|--:|',
    '| 1 | 2 |',
  ].join('\n');

  const doc = markdownToDocument(md, 'اختبار');
  const types = doc.sections.map((b) => b.type);
  assert(types.includes('heading'), 'heading parsed');
  assert(types.includes('paragraph'), 'paragraph parsed');
  assert(types.includes('list'), 'list parsed');
  assert(types.includes('code'), 'code parsed');
  assert(types.includes('table'), 'table parsed');

  const heading = doc.sections.find((b) => b.type === 'heading');
  assertEqual((heading as { level?: number }).level, 1);
});

test('markdownToDocument: metadata + dark theme defaults', () => {
  const doc = markdownToDocument('نص', 'مستند');
  assertEqual(doc.metadata.lang, 'ar');
  assertEqual(doc.theme.mode, 'dark');
  assertEqual(doc.metadata.title, 'مستند');
});

test('markdownToDocument: empty input yields no sections', () => {
  const doc = markdownToDocument('', 'فارغ');
  assertEqual(doc.sections.length, 0);
});

test('buildDocumentHtml: RTL + title + no side footer', () => {
  const doc = markdownToDocument('# مرحباً\n\nنص.', 'مسودة');
  const html = buildDocumentHtml(doc);
  assert(html.startsWith('<!DOCTYPE html>'), 'doctype');
  assert(html.includes('lang="ar"'), 'lang ar');
  assert(html.includes('dir="rtl"'), 'rtl direction');
  assert(html.includes('مسودة'), 'title present');
  assert(!html.includes('تم الإنشاء'), 'no side footer');
  assert(!html.includes('وكيل أسامة'), 'no personal brand');
});

test('buildDocumentHtml: cover icon rendered large on the cover page', () => {
  const doc: DocumentSchema = {
    metadata: { title: 'سفر', lang: 'ar' },
    theme: { mode: 'print' },
    cover: { title: 'دليل السفر', icon: '✈️' },
    sections: [{ type: 'paragraph', content: ['نص'] }],
  };
  const html = buildDocumentHtml(doc);
  assert(html.includes('font-size:88px'), 'large icon');
  assert(html.includes('✈️'), 'icon emoji present');
});

test('buildDocumentHtml: escapes the title', () => {
  const doc: DocumentSchema = {
    metadata: { title: '<script>alert(1)</script>', lang: 'ar' },
    theme: { mode: 'dark' },
    sections: [],
  };
  const html = buildDocumentHtml(doc);
  assert(!html.includes('<script>alert'), 'script is not injected raw');
});

test('buildDocumentHtml: print mode renders white page + dark bold text', () => {
  const doc: DocumentSchema = {
    metadata: { title: 'طباعة', lang: 'ar' },
    theme: { mode: 'print' },
    sections: [
      { type: 'heading', level: 1, content: ['العنوان'] },
      { type: 'paragraph', content: ['نص الطباعة'] },
    ],
  };
  const html = buildDocumentHtml(doc);
  assert(html.includes('background: #FFFFFF'), 'white background');
  assert(html.includes('#0F172A'), 'very dark heading color');
  assert(html.includes('font-weight:600'), 'bold print body text');
  assert(!html.includes('#0A0E17'), 'not dark theme');
});

test('tokensForMode: resolves print palette', () => {
  const tokens = tokensForMode('print');
  assertEqual(tokens.textWeight, '600');
  assertEqual(tokens.background, '#FFFFFF');
  assertEqual(tokensForMode('dark').textWeight, '400');
  assertEqual(tokensForMode('light').textWeight, '500');
});

test('documentToMarkdown: heading round-trips', () => {
  const doc = markdownToDocument('# الموضوع\n\n# ثاني', 'مستند');
  const md = documentToMarkdown(doc);
  assert(md.includes('# الموضوع'), 'heading preserved');
  assert(md.includes('# ثاني'), 'second heading preserved');
});

test('designTokens: dark accent present', () => {
  assert(typeof designTokens.dark.accent === 'string', 'dark accent');
  assert(typeof designTokens.light.accent === 'string', 'light accent');
  assert(designTokens.dark.accent.length > 0, 'accent not empty');
});

export const runSuite = report;