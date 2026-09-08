// PDF print helpers: page CSS, cover icon, title derivation, chunking, progress.
import {
  buildPrintPageCss,
  coverIconFor,
  deriveDocumentTitle,
  groupBlocksForParts,
  injectPrintCss,
  pdfPercent,
  renderPrintHtml,
  resolveCoverIcon,
  sanitizePdfName,
} from '../utils/pdfPrint';
import { Block, buildDocumentHtml, markdownToDocument } from '../utils/documentSchema';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('pdfPrint');

test('deriveDocumentTitle: strips trigger verbs + artifact words', () => {
  assertEqual(
    deriveDocumentTitle('أنشئ ملف pdf عن الذكاء الاصطناعي', undefined, 'ar'),
    'عن الذكاء الاصطناعي',
  );
  assertEqual(deriveDocumentTitle('اكتب عن الطقس', undefined, 'ar'), 'عن الطقس');
});

test('deriveDocumentTitle: falls back to chat title then dated fallback', () => {
  const fromChat = deriveDocumentTitle(undefined, 'محادثة التسوق', 'ar');
  assertEqual(fromChat, 'محادثة التسوق');
  const fallback = deriveDocumentTitle('', '', 'en');
  assert(fallback.startsWith('Conversation document'), 'dated english fallback');
  const arFallback = deriveDocumentTitle(undefined, undefined, 'ar');
  assert(arFallback.startsWith('مستند المحادثة'), 'dated arabic fallback');
});

test('deriveDocumentTitle: bounds length', () => {
  const long = deriveDocumentTitle(
    `سؤال طويل جداً ${'نص '.repeat(100)}`,
    undefined,
    'ar',
  );
  assert(long.length <= 61, 'title bounded');
});

test('sanitizePdfName: removes path hazards and trims', () => {
  assertEqual(sanitizePdfName('a/b\\c:d*e'), 'a b c d e');
  const long = 'x'.repeat(200);
  assert(sanitizePdfName(long).length <= 80, 'name bounded');
  assert(sanitizePdfName('...')?.length > 0, 'empty fallback produced');
});

test('groupBlocksForParts: splits by count and stays chunk-respecting', () => {
  const blocks: Block[] = Array.from({ length: 30 }, (_, i) => ({
    type: 'paragraph',
    content: [`نص ${i}`],
  }));
  const parts = groupBlocksForParts(blocks, 12, 10_000);
  assertEqual(parts.length, 3);
  assertEqual(parts[0].length, 12);
  assertEqual(parts[1].length, 12);
  assertEqual(parts[2].length, 6);
  const small = groupBlocksForParts(blocks, 10, 10_000);
  assertEqual(small.length, 3);
});

test('groupBlocksForParts: empty input yields a single empty part', () => {
  const parts = groupBlocksForParts([]);
  assertEqual(parts.length, 1);
  assertEqual(parts[0].length, 0);
});

test('buildPrintPageCss: only page numbers in header — nothing else', () => {
  const css = buildPrintPageCss('print');
  assert(css.includes('counter(page)'), 'page numbers');
  assert(!css.includes('OSAMAH AGENT'), 'no watermark');
  assert(!css.includes('@top-center'), 'no top-center slot');
  assert(!css.includes('وكيل أسامة'), 'no personal brand');
  assert(css.includes('page-break-inside: avoid'), 'keep rows together');
});

test('injectPrintCss: merges page CSS into a generated document', () => {
  const doc = markdownToDocument('# مرحباً\n\nنص.', 'مستند');
  const base = buildDocumentHtml(doc);
  const injected = injectPrintCss(base, 'print');
  assert(injected.includes('counter(page)'), 'page CSS injected');
  assert(injected.split('counter(page)').length >= 2, 'page numbers present');
  assert(!injected.includes('OSAMAH AGENT'), 'no watermark');
  assert(base.split('</style>').length === 2, 'single style block before injection');
});

test('renderPrintHtml: overrides schema mode to print, no side content', () => {
  const doc = markdownToDocument('# مرحباً\n\nنص.', 'مستند');
  const darkHtml = buildDocumentHtml(doc);
  assert(darkHtml.includes('#0A0E17'), 'dark baseline');
  const printHtml = renderPrintHtml(doc, 'print');
  assert(printHtml.includes('background: #FFFFFF'), 'forced white background');
  assert(!printHtml.includes('OSAMAH AGENT'), 'no watermark');
  assert(!printHtml.includes('وكيل أسامة'), 'no personal brand');
  assert(!printHtml.includes('تم الإنشاء'), 'no side footer');
});

test('coverIconFor: picks a topic-appropriate icon by content', () => {
  assertEqual(coverIconFor('اكتب مستنداً عن الذكاء الاصطناعي'), '🤖');
  assertEqual(coverIconFor('دليل رحلة سياحية إلى إسطنبول'), '✈️');
  assertEqual(coverIconFor('نصائح صحية وطبية'), '🩺');
  assertEqual(coverIconFor('شرح استراتيجيات الاستثمار'), '💰');
  assertEqual(coverIconFor('وصفات مطبخ عربية'), '🍳');
  assertEqual(coverIconFor(undefined), '📄');
  assertEqual(coverIconFor(''), '📄');
});

test('resolveCoverIcon: accepts curated icons, rejects arbitrary ones', () => {
  assertEqual(resolveCoverIcon('✈️', 'any topic'), '✈️');
  assertEqual(resolveCoverIcon('💻', 'any topic'), '💻');
  assertEqual(resolveCoverIcon('❤️', 'مقال عن الذكاء الاصطناعي'), '🤖');
  assertEqual(resolveCoverIcon(undefined, 'دليل تقنيات البرمجة'), '💻');
});

test('pdfPercent: phase progress mapping', () => {
  assertEqual(pdfPercent('organizing'), 10);
  assertEqual(pdfPercent('planning'), 15);
  assertEqual(pdfPercent('writing', 0, 4), 20);
  assertEqual(pdfPercent('writing', 1, 4), 38);
  assertEqual(pdfPercent('writing', 2, 4), 55);
  assertEqual(pdfPercent('writing', 4, 4), 90);
  assertEqual(pdfPercent('building'), 92);
  assertEqual(pdfPercent('rendering'), 96);
  assertEqual(pdfPercent('verifying'), 98);
  assertEqual(pdfPercent('done'), 100);
});

export async function runSuite(): Promise<void> {
  await report();
}