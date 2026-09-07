// Orchestration helpers: ordering, retry classification, time budgets, prompts.
import {
  buildSubtaskPrompt,
  classifyRetry,
  estimateDepth,
  extractJson,
  overallTimeoutFor,
  topologicalOrder,
} from '../utils/orchestrationModel';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('orchestrationModel');

test('overallTimeoutFor: depth budgets', () => {
  assertEqual(overallTimeoutFor('normal'), 90_000);
  assertEqual(overallTimeoutFor('medium'), 240_000);
  assertEqual(overallTimeoutFor('complex'), 600_000);
});

test('classifyRetry: transient conditions are retried', () => {
  assert(classifyRetry(new Error('Request failed with status code 500')));
  assert(classifyRetry(new Error('429 Too Many Requests')));
  assert(classifyRetry(new Error('rate limit exceeded')));
  assert(classifyRetry(new Error('network request timed out')));
  assert(classifyRetry(new Error('abort while waiting')));
});

test('classifyRetry: permanent client errors are not retried', () => {
  assert(!classifyRetry(new Error('400 Bad Request')));
  assert(!classifyRetry(new Error('validation failed at input')));
  assert(!classifyRetry(new Error('forbidden access')));
  assert(!classifyRetry(new Error('Unauthorized')));
  assert(!classifyRetry(new Error('request not found')));
});

test('classifyRetry: unknown errors keep the generous default', () => {
  assert(classifyRetry(new Error('something mysterious crashed')));
  assert(classifyRetry(undefined));
});

test('classifyRetry: agent-unavailable is never retried', () => {
  assert(!classifyRetry(new Error('boom'), true));
});

test('estimateDepth: thresholds', () => {
  assertEqual(estimateDepth(5, 100), 'complex');
  assertEqual(estimateDepth(2, 1500), 'medium');
  assertEqual(estimateDepth(1, 100), 'normal');
  assertEqual(estimateDepth(3, 50), 'medium');
});

test('topologicalOrder: dependencies come first', () => {
  const items = [
    { id: 'b', dependsOn: ['a'] },
    { id: 'a', dependsOn: [] },
    { id: 'c', dependsOn: ['b'] },
  ];
  const order = topologicalOrder(items).map((s) => s.id);
  assertEqual(order, ['a', 'b', 'c']);
});

test('topologicalOrder: cycle-safe (no infinite loop)', () => {
  const items = [
    { id: 'x', dependsOn: ['y'] },
    { id: 'y', dependsOn: ['x'] },
  ];
  const order = topologicalOrder(items);
  assert(order.length === 2, 'both items visited once');
});

test('extractJson: tolerant parse returns null on garbage', () => {
  assertEqual(extractJson('no json here'), null);
  const ok = extractJson('{"a": 1}');
  assert(ok !== null && (ok as { a?: number }).a === 1, 'valid object parsed');
});

test('buildSubtaskPrompt: includes dependency results', () => {
  const results = new Map<string, string>([['a', 'result of a']]);
  const prompt = buildSubtaskPrompt(
    { dependsOn: ['a'], prompt: 'do step b' },
    results,
    'Analyze the market',
  );
  assert(prompt.includes('result of a'), 'dependency result embedded');
  assert(prompt.includes('do step b'), 'own task embedded');
});

export const runSuite = report;