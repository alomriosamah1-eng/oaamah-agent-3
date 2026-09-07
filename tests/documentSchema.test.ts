// Document schema: markdown parsing, HTML rendering, tokens.
import {
  buildDocumentHtml,
  designTokens,
  DocumentSchema,
  documentToMarkdown,
  markdownToDocument,
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

test('buildDocumentHtml: RTL + title + brand footer', () => {
  const doc = markdownToDocument('# مرحباً\n\nنص.', 'مسودة');
  const html = buildDocumentHtml(doc);
  assert(html.startsWith('<!DOCTYPE html>'), 'doctype');
  assert(html.includes('lang="ar"'), 'lang ar');
  assert(html.includes('dir="rtl"'), 'rtl direction');
  assert(html.includes('مسودة'), 'title present');
  assert(html.includes('وكيل أسامة'), 'brand footer');
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