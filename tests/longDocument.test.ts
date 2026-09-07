// Long-form document builder: page-target detection, target resolution, the
// injectable sectioned flow, and every fallback path (empty/abort/outline-fail/
// all-sections-fail must never collapse silently to nothing).
import {
  buildLongDocument,
  detectPageTarget,
  excerptText,
  isLongDocRequest,
  LongLlm,
  resolveTargetSections,
  sanitizeBlocks,
} from '../utils/longDocument';
import { PdfMessage } from '../utils/chatClean';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('longDocument');

const CONVO: PdfMessage[] = [
  { role: 'user', content: 'اكتب مستنداً شاملاً عن الذكاء الاصطناعي، 100 صفحة' },
  { role: 'bot', content: 'سأقدّم موجزاً ثم نتوسع في التفاصيل، الأقسام، والتطبيقات العملية.' },
];

test('detectPageTarget: Latin and Arabic (incl. Arabic-Indic digits)', () => {
  assertEqual(detectPageTarget('اكتب 100 صفحة عن الذكاء'), 100);
  assertEqual(detectPageTarget('اكتب ٥٠ صفحة'), 50);
  assertEqual(detectPageTarget('write a 500 pages document'), 500);
  assertEqual(detectPageTarget('no target here'), 0);
});

test('resolveTargetSections: mapping and clamps', () => {
  assertEqual(resolveTargetSections(0), 8); // base default
  assertEqual(resolveTargetSections(100), 25);
  assertEqual(resolveTargetSections(40), 10);
  assertEqual(resolveTargetSections(500), 120); // max clamp
  assertEqual(resolveTargetSections(2), 4); // min clamp
});

test('isLongDocRequest: page counts trigger long form', () => {
  assert(isLongDocRequest('100 صفحة عن السوق'), 'Arabic pages');
  assert(isLongDocRequest('long document please'), 'long keyword');
  assert(isLongDocRequest('مستند مفصل شامل'), 'Arabic adjectives');
});

test('isLongDocRequest: plain PDF requests are NOT long', () => {
  assert(!isLongDocRequest('أنشئ ملف pdf للدردشة'), 'no page target / adjective');
});

test('excerptText: preserves short text', () => {
  assertEqual(excerptText('قصير', 8000), 'قصير');
});

test('excerptText: bounds long text with head + tail', () => {
  const long = 'a'.repeat(4000);
  const out = excerptText(long, 1000);
  assert(out.length <= 1027, 'bounded to max + fixed marker overhead');
  assert(out.length > 1000, 'content stays at max width');
  assert(out.startsWith('a'.repeat(500)), 'head kept');
  assert(out.endsWith('a'.repeat(500)), 'tail kept');
  assert(out.includes('…'), 'truncation marker present');
});

test('sanitizeBlocks: keeps only object blocks with a string type', () => {
  const raw = [
    { type: 'paragraph', content: ['x'] },
    'junk',
    null,
    { type: 'heading', level: 2, content: ['y'] },
    { nope: true },
  ];
  const blocks = sanitizeBlocks(raw);
  assertEqual(blocks.length, 2);
  assertEqual(blocks[1].type, 'heading');
});

test('buildLongDocument: plans, writes sections, wraps DocumentSchema', async () => {
  let calls = 0;
  const phases: string[] = [];
  const llm: LongLlm = async () => {
    calls += 1;
    if (calls === 1) {
      return JSON.stringify({
        sections: [
          { title: 'الملخص التنفيذي', guidance: 'لخّص كامل المحادثة' },
          { title: 'الأقسام والتفاصيل', guidance: 'فصّل المحتوى في أقسام' },
        ],
      });
    }
    return JSON.stringify({
      blocks: [
        { type: 'paragraph', content: ['فقرة أولى'] },
        { type: 'paragraph', content: ['فقرة ثانية'] },
      ],
    });
  };

  const schema = await buildLongDocument(CONVO, {
    title: 'مستند الذكاء',
    lang: 'ar',
    llm,
    onStatus: (s) => phases.push(s.phase),
  });

  assertEqual(calls, 3, '1 outline + 2 sections');
  assertEqual(schema.metadata.lang, 'ar');
  assertEqual(schema.theme.mode, 'dark');
  assertEqual(schema.cover?.badge, 'وكيل أسامة');
  assertEqual(schema.sections.length, 6); // 2 sections × (heading + 2 paragraphs)
  const first = schema.sections[0];
  if (first.type !== 'heading') {
    throw new Error('expected first block to be a heading');
  }
  assertEqual(first.level, 2);
  assertEqual(first.content, ['الملخص التنفيذي']);
  assert(phases.includes('planning'), 'planning reported');
  assert(phases.includes('writing'), 'writing reported');
  assert(phases.includes('completing'), 'completing reported');
});

test('buildLongDocument: empty conversation returns the base document', async () => {
  const llm: LongLlm = async () => JSON.stringify({ sections: [] });
  const schema = await buildLongDocument([], { title: 'فارغ', lang: 'ar', llm });
  assertEqual(schema.metadata.title, 'فارغ');
  assertEqual(schema.sections.length, 0);
});

test('buildLongDocument: already-aborted signal returns base immediately', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const llm: LongLlm = async () => {
    calls += 1;
    return JSON.stringify({ sections: [{ title: 'x', guidance: 'y' }] });
  };
  const schema = await buildLongDocument(CONVO, {
    title: 'مقاطَع',
    signal: controller.signal,
    llm,
  });
  assertEqual(calls, 0, 'no llm call on abort');
  assertEqual(schema.metadata.title, 'مقاطَع');
});

test('buildLongDocument: outline failure falls back to markdown-derived doc', async () => {
  const llm: LongLlm = async () => 'this is not json at all';
  const schema = await buildLongDocument(CONVO, { title: 'سقوط', lang: 'ar', llm });
  assert(schema.metadata.title === 'سقوط', 'schema still produced');
  assert(schema.sections.length >= 2, 'markdown headings from conversation');
});

test('buildLongDocument: section failures are skipped without collapsing the rest', async () => {
  let calls = 0;
  const llm: LongLlm = async () => {
    calls += 1;
    if (calls === 1) {
      return JSON.stringify({
        sections: [{ title: 'أ', guidance: 'g' }, { title: 'ب', guidance: 'g' }],
      });
    }
    return 'garbage (section fails)';
  };
  const schema = await buildLongDocument(CONVO, { title: 'أقسام', lang: 'ar', llm });
  assertEqual(schema.sections.length, 4, 'fallback base = 2 headings + 2 paragraphs');
});

export const runSuite = report;