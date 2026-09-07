// Prompt-engineering model: intent routing, skill library, quality validator.
import {
  detectIntent,
  detectLang,
  getSkill,
  INTENT_KEYS,
  listSkills,
  validatePrompt,
} from '../utils/promptModel';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('promptModel');

test('detectIntent: Arabic writing request', () => {
  assertEqual(detectIntent('اكتب لي مقالاً عن الذكاء الاصطناعي'), 'writing');
});

test('detectIntent: coding request', () => {
  assertEqual(
    detectIntent('build a react native app function that calls the api'),
    'coding',
  );
});

test('detectIntent: Arabic data analysis', () => {
  assertEqual(detectIntent('قم بتحليل بيانات أرباح الربع الأول'), 'analysis');
});

test('detectIntent: research', () => {
  assertEqual(detectIntent('بحث أكاديمي حول الطاقة المتجددة بمراجع'), 'research');
});

test('detectIntent: unknown → general', () => {
  assertEqual(detectIntent('مرحباً'), 'general');
  assertEqual(detectIntent('zzz qqq xxx'), 'general');
});

test('detectLang', () => {
  assertEqual(detectLang('هذا نص عربي'), 'ar');
  assertEqual(detectLang('this is english'), 'en');
});

test('skill library: 8 skills and routing', () => {
  const skills = listSkills();
  assert(skills.length === INTENT_KEYS.length, 'skill per intent');
  assertEqual(skills.length, 8);
  assertEqual(getSkill('coding').id, 'coding');
  assertEqual(getSkill('general').id, 'general');
  assert(getSkill('general').rules.length > 0, 'general skill has rules');
});

test('validatePrompt: strong prompt scores high on all dimensions', () => {
  const strong =
    'Act as an expert engineer. Please build a tool for this project stack. ' +
    'Constraints: must not add external dependencies. Input: user text. ' +
    'Return the output in JSON format. Example: {"ok":true}. ' +
    'Handle invalid input and empty edge cases. Success criteria: PASS all tests.';
  const q = validatePrompt(strong);
  assertEqual(q.missing.length, 0);
  assertEqual(q.score, 100);
});

test('validatePrompt: weak prompt scores zero', () => {
  const q = validatePrompt('thanks for your help');
  assertEqual(q.passed.length, 0);
  assertEqual(q.score, 0);
  assertEqual(q.missing.length, 10);
});

export const runSuite = report;