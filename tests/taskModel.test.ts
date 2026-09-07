// Task detection model — pure heuristics routed into ChatPage.
import { detectLang, isComplexTask } from '../utils/taskModel';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('taskModel');

test('detectLang: Arabic script', () => {
  assertEqual(detectLang('مرحباً كيف حالك؟'), 'ar');
  assertEqual(detectLang('ابحث عن دراسة مقارنة'), 'ar');
});

test('detectLang: Latin script', () => {
  assertEqual(detectLang('hello world'), 'en');
  assertEqual(detectLang('Write a research report'), 'en');
});

test('detectLang: Arabic in a large text', () => {
  assertEqual(detectLang(`${'x'.repeat(60)} بعض العربية`), 'ar');
});

test('isComplexTask: Arabic research keywords', () => {
  assert(isComplexTask('أريد بحثاً شاملاً عن الذكاء الاصطناعي'), 'بحث keyword');
  assert(isComplexTask('اكتب تقريراً عن السوق'), 'تقرير keyword');
  assert(isComplexTask('100 صفحة عن تاريخ مصر'), '100 صفحة keyword');
});

test('isComplexTask: English keywords', () => {
  assert(isComplexTask('Write a 100 pages report and research'), 'research/report');
  assert(isComplexTask('provide an academic study comparison'), 'academic/study');
});

test('isComplexTask: false on simple queries', () => {
  assert(!isComplexTask('ما هي عاصمة فرنسا؟'), 'simple question');
  assert(!isComplexTask('hello, how are you?'), 'greeting');
});

test('isComplexTask: length heuristic', () => {
  const long = 'x'.repeat(501);
  assert(isComplexTask(long), '>500 chars is complex');
  assert(!isComplexTask('ok'), 'short text is simple');
});

test('isComplexTask: question / enumeration heuristics', () => {
  assert(isComplexTask('لماذا؟ من أين؟ كيف؟ متى؟'), '3+ question marks');
  const enumerated = '1. a\n2. b\n3. c\n4. d';
  assert(isComplexTask(enumerated), 'enumerated list is complex');
});

export const runSuite = report;