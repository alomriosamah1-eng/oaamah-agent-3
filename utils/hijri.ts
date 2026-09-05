// Islamic (Hijri) calendar conversion — Gregorian → Hijri on-device.
//
// Intl.DateTimeFormat with an `islamic` calendar is not dependable on
// Hermes/Android, so the Hijri date is computed directly from the Julian
// day number using the standard tabular (Umm al-Qura-basis) algorithm.
// Values are approximate to ±1 day, which is fine for a date card.

export interface HijriDate {
  day: number;
  month: number;
  year: number;
}

export const HIJRI_MONTHS_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
] as const;

export const HIJRI_MONTHS_EN = [
  'Muharram',
  'Safar',
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
] as const;

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function intPart(x: number): number {
  return Math.floor(x);
}

/** Julian day number for a Gregorian date (local midnight components). */
export function toJulianDay(year: number, month: number, day: number): number {
  const a = intPart((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    intPart((153 * m + 2) / 5) +
    365 * y +
    intPart(y / 4) -
    intPart(y / 100) +
    intPart(y / 400) -
    32045
  );
}

/** Gregorian → Hijri (tabular algorithm, ±1 day). */
export function gregorianToHijri(date: Date): HijriDate {
  const jd = toJulianDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const l = jd - 1948440 + 10632;
  const n = intPart((l - 1) / 10631);
  let ll = l - 10631 * n + 354;
  const j =
    intPart((10985 - ll) / 5316) * intPart((50 * ll) / 17719) +
    intPart(ll / 5670) * intPart((43 * ll) / 15238);
  ll = ll - intPart((30 - j) / 15) * intPart((17719 * j) / 50) - intPart(j / 16) * intPart((15238 * j) / 43) + 29;
  const month = intPart((24 * ll) / 709);
  const day = ll - intPart((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { day, month: month + 1, year };
}

export interface FormattedHijri {
  hijri: HijriDate;
  /** e.g. "5 رمضان 1448" */
  ar: string;
  /** e.g. "5 Ramadan 1448" */
  en: string;
  /** e.g. "السبت" / "Saturday" */
  weekdayAr: string;
  weekdayEn: string;
}

export function formatHijri(date: Date): FormattedHijri {
  const hijri = gregorianToHijri(date);
  const monthAr = HIJRI_MONTHS_AR[hijri.month - 1];
  const monthEn = HIJRI_MONTHS_EN[hijri.month - 1];
  return {
    hijri,
    ar: `${hijri.day} ${monthAr} ${hijri.year}`,
    en: `${hijri.day} ${monthEn} ${hijri.year}`,
    weekdayAr: WEEKDAYS_AR[date.getDay()],
    weekdayEn: WEEKDAYS_EN[date.getDay()],
  };
}