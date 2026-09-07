// Pure user-profile model — no RN / storage imports so it is Node-testable.

export interface UserProfile {
  name?: string;
  preferredName?: string;
  profession?: string;
  specialization?: string;
  field?: string;
  education?: string;
  experience?: string;
  interests: string[];
  goals: string[];
  preferredLanguage?: 'ar' | 'en';
  preferredTone?: 'formal' | 'friendly' | 'professional' | 'simple';
  preferredOutputFormat?: string;
  responseLength?: 'short' | 'medium' | 'detailed';
  technicalLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  researchDepth?: 'light' | 'moderate' | 'deep';
  preferredFileTypes: string[];
  preferredDesignStyle?: string;
  themePreference?: 'dark' | 'light';
  learningGoals: string[];
  productionGoals: string[];
  preferredTopics: string[];
  skillLevel?: string;
  explanationStyle?: string;
  lastUpdated: number;
}

export interface ProfileFieldGroup {
  key: string;
  icon: string;
  color: string;
  labelAr: string;
  labelEn: string;
  fields: ProfileField[];
}

export interface ProfileOption {
  value: string;
  labelAr: string;
  labelEn: string;
}

export type ProfileField =
  | { key: keyof UserProfile; type: 'text'; placeholderAr: string; placeholderEn: string }
  | { key: keyof UserProfile; type: 'textarea'; placeholderAr: string; placeholderEn: string }
  | { key: keyof UserProfile; type: 'select'; options: ProfileOption[] }
  | { key: keyof UserProfile; type: 'multiselect'; placeholderAr: string; placeholderEn: string }
  | { key: keyof UserProfile; type: 'toggle'; options: ProfileOption[] };

export const PROFILE_KEY = 'osamah:userProfile';

export const DEFAULT_PROFILE: UserProfile = {
  interests: [],
  goals: [],
  preferredFileTypes: [],
  learningGoals: [],
  productionGoals: [],
  preferredTopics: [],
  lastUpdated: 0,
};

export const LANGUAGE_OPTIONS: ProfileOption[] = [
  { value: 'ar', labelAr: 'العربية', labelEn: 'Arabic' },
  { value: 'en', labelAr: 'الإنجليزية', labelEn: 'English' },
];

export const TONE_OPTIONS: ProfileOption[] = [
  { value: 'formal', labelAr: 'رسمي', labelEn: 'Formal' },
  { value: 'friendly', labelAr: 'ودود', labelEn: 'Friendly' },
  { value: 'professional', labelAr: 'احترافي', labelEn: 'Professional' },
  { value: 'simple', labelAr: 'بسيط', labelEn: 'Simple' },
];

export const TECHNICAL_LEVEL_OPTIONS: ProfileOption[] = [
  { value: 'beginner', labelAr: 'مبتدئ', labelEn: 'Beginner' },
  { value: 'intermediate', labelAr: 'متوسط', labelEn: 'Intermediate' },
  { value: 'advanced', labelAr: 'متقدم', labelEn: 'Advanced' },
  { value: 'expert', labelAr: 'خبير', labelEn: 'Expert' },
];

export const RESPONSE_LENGTH_OPTIONS: ProfileOption[] = [
  { value: 'short', labelAr: 'قصير', labelEn: 'Short' },
  { value: 'medium', labelAr: 'متوسط', labelEn: 'Medium' },
  { value: 'detailed', labelAr: 'مفصّل', labelEn: 'Detailed' },
];

export const RESEARCH_DEPTH_OPTIONS: ProfileOption[] = [
  { value: 'light', labelAr: 'خفيف', labelEn: 'Light' },
  { value: 'moderate', labelAr: 'متوسط', labelEn: 'Moderate' },
  { value: 'deep', labelAr: 'عميق', labelEn: 'Deep' },
];

export const THEME_OPTIONS: ProfileOption[] = [
  { value: 'dark', labelAr: 'داكن', labelEn: 'Dark' },
  { value: 'light', labelAr: 'فاتح', labelEn: 'Light' },
];

const OPTION_SETS: Partial<Record<keyof UserProfile, ProfileOption[]>> = {
  preferredLanguage: LANGUAGE_OPTIONS,
  preferredTone: TONE_OPTIONS,
  technicalLevel: TECHNICAL_LEVEL_OPTIONS,
  responseLength: RESPONSE_LENGTH_OPTIONS,
  researchDepth: RESEARCH_DEPTH_OPTIONS,
  themePreference: THEME_OPTIONS,
};

export function getFieldGroups(): ProfileFieldGroup[] {
  return [
    {
      key: 'personal',
      icon: 'person',
      color: '#3B82F6',
      labelAr: 'المعلومات الشخصية',
      labelEn: 'Personal Info',
      fields: [
        { key: 'name', type: 'text', placeholderAr: 'الاسم الكامل', placeholderEn: 'Full name' },
        { key: 'preferredName', type: 'text', placeholderAr: 'الاسم الذي تفضّل التخاطب به', placeholderEn: 'Preferred name' },
        { key: 'education', type: 'textarea', placeholderAr: 'أعلى مؤهل علمي', placeholderEn: 'Highest education' },
        { key: 'experience', type: 'textarea', placeholderAr: 'سنوات ومجال الخبرة', placeholderEn: 'Years and field of experience' },
        { key: 'preferredLanguage', type: 'select', options: LANGUAGE_OPTIONS },
        { key: 'preferredTone', type: 'select', options: TONE_OPTIONS },
      ],
    },
    {
      key: 'profession',
      icon: 'work',
      color: '#F97316',
      labelAr: 'التخصص والعمل',
      labelEn: 'Profession',
      fields: [
        { key: 'profession', type: 'text', placeholderAr: 'المهنة / المسمى الوظيفي', placeholderEn: 'Profession / job title' },
        { key: 'specialization', type: 'text', placeholderAr: 'التخصص الدقيق', placeholderEn: 'Specialization' },
        { key: 'field', type: 'text', placeholderAr: 'المجال / القطاع', placeholderEn: 'Field / sector' },
        { key: 'technicalLevel', type: 'select', options: TECHNICAL_LEVEL_OPTIONS },
        { key: 'skillLevel', type: 'text', placeholderAr: 'مستوى المهارة الحالي', placeholderEn: 'Current skill level' },
      ],
    },
    {
      key: 'interests',
      icon: 'favorite',
      color: '#EC4899',
      labelAr: 'الاهتمامات',
      labelEn: 'Interests',
      fields: [
        { key: 'interests', type: 'multiselect', placeholderAr: 'أضف اهتماماتك ثم اضغط Enter', placeholderEn: 'Add interests, then press Enter' },
        { key: 'preferredTopics', type: 'multiselect', placeholderAr: 'المواضيع التي تفضّل الحديث عنها', placeholderEn: 'Topics you like to discuss' },
        { key: 'preferredFileTypes', type: 'multiselect', placeholderAr: 'أنواع الملفات المفضلة (PDF, DOCX...)', placeholderEn: 'Preferred file types (PDF, DOCX...)' },
        { key: 'preferredDesignStyle', type: 'text', placeholderAr: 'أسلوب التصميم المفضل', placeholderEn: 'Preferred design style' },
      ],
    },
    {
      key: 'goals',
      icon: 'flag',
      color: '#10B981',
      labelAr: 'الأهداف',
      labelEn: 'Goals',
      fields: [
        { key: 'goals', type: 'multiselect', placeholderAr: 'أهداف عامة', placeholderEn: 'General goals' },
        { key: 'learningGoals', type: 'multiselect', placeholderAr: 'أهداف التعلم', placeholderEn: 'Learning goals' },
        { key: 'productionGoals', type: 'multiselect', placeholderAr: 'أهداف الإنتاج والمشاريع', placeholderEn: 'Production and project goals' },
      ],
    },
    {
      key: 'usage',
      icon: 'tune',
      color: '#8B5CF6',
      labelAr: 'تفضيلات الاستخدام',
      labelEn: 'Usage Prefs',
      fields: [
        { key: 'responseLength', type: 'select', options: RESPONSE_LENGTH_OPTIONS },
        { key: 'researchDepth', type: 'select', options: RESEARCH_DEPTH_OPTIONS },
        { key: 'explanationStyle', type: 'text', placeholderAr: 'أسلوب الشرح المفضل (أمثلة، مبسّط، متعمق)', placeholderEn: 'Preferred explanation style (examples, simple, deep)' },
        { key: 'preferredOutputFormat', type: 'text', placeholderAr: 'صيغة المخرجات (Markdown, PDF...)', placeholderEn: 'Output format (Markdown, PDF...)' },
        { key: 'themePreference', type: 'toggle', options: THEME_OPTIONS },
      ],
    },
  ];
}

export function normalizeProfile(raw: Partial<UserProfile>): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    ...raw,
    interests: raw.interests ?? [],
    goals: raw.goals ?? [],
    preferredFileTypes: raw.preferredFileTypes ?? [],
    learningGoals: raw.learningGoals ?? [],
    productionGoals: raw.productionGoals ?? [],
    preferredTopics: raw.preferredTopics ?? [],
    lastUpdated: typeof raw.lastUpdated === 'number' ? raw.lastUpdated : DEFAULT_PROFILE.lastUpdated,
  };
}

const CTX_LABELS: Record<keyof UserProfile, { ar: string; en: string }> = {
  name: { ar: 'الاسم', en: 'Name' },
  preferredName: { ar: 'الاسم المفضل', en: 'Preferred name' },
  profession: { ar: 'المهنة', en: 'Profession' },
  specialization: { ar: 'التخصص', en: 'Specialization' },
  field: { ar: 'المجال', en: 'Field' },
  education: { ar: 'المؤهل العلمي', en: 'Education' },
  experience: { ar: 'الخبرة', en: 'Experience' },
  interests: { ar: 'الاهتمامات', en: 'Interests' },
  goals: { ar: 'الأهداف', en: 'Goals' },
  preferredLanguage: { ar: 'اللغة المفضلة', en: 'Preferred language' },
  preferredTone: { ar: 'النبرة المفضلة', en: 'Preferred tone' },
  preferredOutputFormat: { ar: 'صيغة المخرجات', en: 'Output format' },
  responseLength: { ar: 'طول الرد', en: 'Response length' },
  technicalLevel: { ar: 'المستوى التقني', en: 'Technical level' },
  researchDepth: { ar: 'عمق البحث', en: 'Research depth' },
  preferredFileTypes: { ar: 'أنواع الملفات المفضلة', en: 'Preferred file types' },
  preferredDesignStyle: { ar: 'أسلوب التصميم', en: 'Design style' },
  themePreference: { ar: 'الثيم المفضل', en: 'Theme preference' },
  learningGoals: { ar: 'أهداف التعلم', en: 'Learning goals' },
  productionGoals: { ar: 'أهداف الإنتاج', en: 'Production goals' },
  preferredTopics: { ar: 'المواضيع المفضلة', en: 'Preferred topics' },
  skillLevel: { ar: 'مستوى المهارة', en: 'Skill level' },
  explanationStyle: { ar: 'أسلوب الشرح', en: 'Explanation style' },
  lastUpdated: { ar: '', en: '' },
};

const MAX_CONTEXT_WORDS = 200;

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value !== '';
  if (Array.isArray(value)) return value.length > 0;
  return value !== 0;
}

function optionLabel(key: keyof UserProfile, value: string, lang: 'ar' | 'en'): string {
  const option = OPTION_SETS[key]?.find((o) => o.value === value);
  return option ? (lang === 'ar' ? option.labelAr : option.labelEn) : value;
}

export function formatValue(key: keyof UserProfile, value: unknown, lang: 'ar' | 'en'): string {
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v)).filter((v) => v !== '');
    if (items.length === 0) return '';
    return items.join(lang === 'ar' ? '، ' : ', ');
  }
  if (typeof value !== 'string' || value === '') return '';
  return optionLabel(key, value, lang);
}

function pushKey(keys: Array<keyof UserProfile>, key: keyof UserProfile): void {
  if (!keys.includes(key)) keys.push(key);
}

function pushKeys(keys: Array<keyof UserProfile>, list: Array<keyof UserProfile>): void {
  for (const key of list) pushKey(keys, key);
}

export function buildProfileContext(profile: UserProfile, requestLanguage: 'ar' | 'en'): string | null {
  const keys: Array<keyof UserProfile> = [];

  if (profile.preferredName || profile.name) {
    pushKey(keys, profile.preferredName ? 'preferredName' : 'name');
  }
  if (hasValue(profile.technicalLevel)) {
    pushKeys(keys, ['profession', 'technicalLevel', 'specialization', 'field', 'skillLevel']);
  }
  if (hasValue(profile.researchDepth)) {
    pushKeys(keys, ['field', 'specialization', 'researchDepth']);
  }
  if (profile.explanationStyle) {
    pushKeys(keys, ['education', 'explanationStyle', 'technicalLevel']);
  }
  if (hasValue(profile.specialization) || profile.productionGoals.length > 0) {
    pushKeys(keys, ['productionGoals', 'specialization', 'preferredOutputFormat']);
  }
  if (hasValue(profile.responseLength)) {
    pushKey(keys, 'responseLength');
  }

  const lines: string[] = [];
  let words = 0;
  for (const key of keys) {
    const value = formatValue(key, profile[key], requestLanguage);
    if (!value) continue;
    const line = `${CTX_LABELS[key][requestLanguage]}: ${value}`;
    const count = line.split(/\s+/).filter(Boolean).length;
    if (words + count > MAX_CONTEXT_WORDS) break;
    words += count;
    lines.push(line);
  }

  if (lines.length === 0) return null;
  const header = requestLanguage === 'ar' ? '[ملف المستخدم]' : '[User Profile]';
  return `${header}\n${lines.join('\n')}`;
}

const ARRAY_KEYS: ReadonlySet<keyof UserProfile> = new Set([
  'interests',
  'goals',
  'learningGoals',
  'productionGoals',
  'preferredTopics',
  'preferredFileTypes',
]);

const PARSE_INDEX = new Map<string, keyof UserProfile>();
for (const key of Object.keys(CTX_LABELS) as Array<keyof UserProfile>) {
  PARSE_INDEX.set(CTX_LABELS[key].ar.toLowerCase(), key);
  PARSE_INDEX.set(CTX_LABELS[key].en.toLowerCase(), key);
}

function reverseOptionValue(key: keyof UserProfile, value: string): string {
  const normalized = value.trim().toLowerCase();
  const option = OPTION_SETS[key]?.find(
    (o) => o.labelAr.trim().toLowerCase() === normalized || o.labelEn.trim().toLowerCase() === normalized,
  );
  return option ? option.value : value.trim();
}

function parseLine(result: Partial<UserProfile>, key: keyof UserProfile, value: string): void {
  const target = result as Record<string, unknown>;
  if (ARRAY_KEYS.has(key)) {
    target[key] = value
      .split(/[،,؛;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return;
  }
  if (key === 'lastUpdated') {
    const num = Number(value);
    if (!Number.isNaN(num)) target[key] = num;
    return;
  }
  target[key] = reverseOptionValue(key, value);
}

export function parseProfileString(raw: string): Partial<UserProfile> {
  const result: Partial<UserProfile> = {};
  for (const line of raw.split(/\r?\n/)) {
    const sep = line.indexOf(':');
    if (sep <= 0) continue;
    const label = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^-\s*/, '');
    if (!label || !value) continue;
    const key = PARSE_INDEX.get(label.toLowerCase());
    if (!key) continue;
    parseLine(result, key, value);
  }
  return result;
}