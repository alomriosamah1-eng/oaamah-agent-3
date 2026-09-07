// Chat content filtering that guarantees agent status chatter never reaches
// exported PDFs / archives.
import {
  cleanChatMessages,
  conversationToPrompt,
  isInternalText,
  messagesToMarkdown,
  PdfMessage,
} from '../utils/chatClean';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('chatClean');

test('isInternalText: Arabic orchestration status lines', () => {
  assert(isInternalText('جارٍ التنفيذ…'), 'جارٍ التنفيذ');
  assert(isInternalText('جارٍ التحليل…'), 'جارٍ التحليل');
  assert(isInternalText('جارٍ التجميع…'), 'جارٍ التجميع');
  assert(isInternalText('جارٍ إعادة المحاولة…'), 'جارٍ إعادة المحاولة');
});

test('isInternalText: English orchestration status lines', () => {
  assert(isInternalText('Executing…'), 'Executing');
  assert(isInternalText('Analyzing…'), 'Analyzing');
  assert(isInternalText('Compiling…'), 'Compiling');
  assert(isInternalText('Retrying step 2…'), 'Retrying');
});

test('isInternalText: real content is kept', () => {
  assert(!isInternalText('هذا محتوى طويل بما يكفي ليصل إلى قائمة PDF'), 'arabic content');
  assert(!isInternalText('The temperature today is 30 degrees and it is sunny here in the city.'), 'english content');
  assert(!isInternalText('hello'), 'short normal text passes the length gate but no pattern');
});

test('cleanChatMessages: drops empty + internal lines, keeps real ones', () => {
  const rows: PdfMessage[] = [
    { role: 'bot', content: 'جارٍ التحليل…' },
    { role: 'user', content: '   ' },
    { role: 'user', content: 'اكتب لي تقريراً عن السوق المصري' },
    { role: 'bot', content: 'هذا هو التقرير الكامل الذي طلبته مع التفاصيل المالية وجميع البيانات.' },
  ];
  const cleaned = cleanChatMessages(rows);
  assertEqual(cleaned.length, 2);
  assert(cleaned[0].content.startsWith('اكتب لي'), 'user message kept first');
});

test('messagesToMarkdown: labels roles in Arabic', () => {
  const md = messagesToMarkdown([
    { role: 'user', content: 'سؤالي هنا' },
    { role: 'bot', content: 'إجابة كاملة طويلة بما يكفي حتى لا تُفلتر' },
  ]);
  assert(md.includes('### المستخدم'), 'user heading');
  assert(md.includes('### الوكيل'), 'assistant heading');
  assert(md.includes('سؤالي هنا'), 'content present');
});

test('conversationToPrompt: role prefixes', () => {
  const prompt = conversationToPrompt([
    { role: 'user', content: 'س' },
    { role: 'bot', content: 'ج طويل كفاية' },
  ]);
  assert(prompt.includes('[User]'), 'user bracket');
  assert(prompt.includes('[Assistant]'), 'assistant bracket');
});

export const runSuite = report;