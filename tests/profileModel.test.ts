// Pure user-profile model: normalization, formatting, context building, parsing.
import {
  buildProfileContext,
  DEFAULT_PROFILE,
  formatValue,
  getFieldGroups,
  normalizeProfile,
  parseProfileString,
  UserProfile,
} from '../utils/profileModel';
import { assert, assertEqual, makeSuite } from './helpers';

const { test, report } = makeSuite('profileModel');

test('DEFAULT_PROFILE: array fields are empty and lastUpdated 0', () => {
  assertEqual(DEFAULT_PROFILE.interests, []);
  assertEqual(DEFAULT_PROFILE.lastUpdated, 0);
});

test('normalizeProfile: fills defaults and preserves scalar fields', () => {
  const p = normalizeProfile({ name: 'أحمد' } as Partial<UserProfile>);
  assertEqual(p.name, 'أحمد');
  assertEqual(p.interests, []);
  assertEqual(p.lastUpdated, 0);
});

test('normalizeProfile: keeps provided arrays', () => {
  const p = normalizeProfile({ interests: ['AI', 'تطوير'] } as Partial<UserProfile>);
  assertEqual(p.interests, ['AI', 'تطوير']);
});

test('formatValue: arrays join with Arabic separator', () => {
  assertEqual(formatValue('goals', ['أ', 'ب'], 'ar'), 'أ، ب');
  assertEqual(formatValue('goals', ['a', 'b'], 'en'), 'a, b');
});

test('formatValue: select options map to localized labels', () => {
  assertEqual(formatValue('preferredTone', 'formal', 'ar'), 'رسمي');
  assertEqual(formatValue('preferredTone', 'formal', 'en'), 'Formal');
  assertEqual(formatValue('preferredLanguage', 'ar', 'ar'), 'العربية');
});

test('buildProfileContext: null on empty profile', () => {
  assertEqual(buildProfileContext(DEFAULT_PROFILE, 'ar'), null);
});

test('buildProfileContext: includes preferred name', () => {
  const ctx = buildProfileContext(
    { ...DEFAULT_PROFILE, preferredName: 'أسامة' },
    'ar',
  );
  assert(ctx !== null && ctx.includes('الاسم المفضل: أسامة'), 'Arabic ctx');
});

test('buildProfileContext: English labels', () => {
  const ctx = buildProfileContext(
    { ...DEFAULT_PROFILE, preferredName: 'Osamah', preferredLanguage: 'en' },
    'en',
  );
  assert(ctx !== null && ctx.includes('Preferred name: Osamah'), 'English ctx');
});

test('parseProfileString: name + interests round-trip', () => {
  const raw = '[ملف المستخدم]\nالاسم: أحمد\nالاهتمامات: AI، تطوير';
  const p = parseProfileString(raw);
  assertEqual(p.name, 'أحمد');
  assertEqual(p.interests, ['AI', 'تطوير']);
});

test('parseProfileString: option labels reverse to values', () => {
  const raw = 'النبرة المفضلة: رسمي\nعمق البحث: عميق';
  const p = parseProfileString(raw);
  assertEqual(p.preferredTone, 'formal');
  assertEqual(p.researchDepth, 'deep');
});

test('getFieldGroups: provides field definitions with labels', () => {
  const groups = getFieldGroups();
  assert(groups.length > 0, 'at least one group');
  for (const g of groups) {
    assert(g.labelAr.length > 0, 'Arabic label');
    assert(g.labelEn.length > 0, 'English label');
    assert(g.fields.length > 0, 'fields present');
  }
});

export const runSuite = report;