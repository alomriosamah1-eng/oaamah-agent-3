// Pure task-detection model — no RN / Expo imports so the routing logic is
// Node-testable.

const ARABIC_KEYWORDS = [
  'بحث',
  'تقرير',
  'تحليل',
  'دراسة',
  'مقارنة',
  'مقال',
  'ملف',
  'وثيقة',
  '100 صفحة',
  'إنشاء ملف',
  'PDF',
  'أكاديمي',
  'عميق',
];

const ENGLISH_KEYWORDS = [
  'research',
  'report',
  'analysis',
  'study',
  'compare',
  'essay',
  'document',
  '100 pages',
  'academic',
  'deep',
];

export function detectLang(text: string): 'ar' | 'en' {
  const sample = text.slice(0, 100);
  for (const ch of sample) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x0600 && code <= 0x06ff) return 'ar';
  }
  return 'en';
}

export function isComplexTask(text: string): boolean {
  const lower = text.toLowerCase();

  for (const kw of ARABIC_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  for (const kw of ENGLISH_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }

  if (text.length > 500) return true;

  const questionMarks = (text.match(/[؟?]/g) ?? []).length;
  if (questionMarks >= 3) return true;

  const enumerated =
    (text.match(/^\s*[\d٠-٩]+[\.\)]\s/gm) ?? []).length;
  if (enumerated >= 3) return true;

  return false;
}