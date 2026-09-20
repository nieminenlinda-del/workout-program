import type { CanonicalTemplateDay, TemplateDay } from '../types/session';

export const WEEKDAY_BY_LETTER: Record<CanonicalTemplateDay, 'Mon' | 'Tue' | 'Thu' | 'Fri'> = {
  A: 'Mon',
  B: 'Tue',
  C: 'Thu',
  D: 'Fri',
};

export const LETTER_BY_WEEKDAY: Record<'Mon' | 'Tue' | 'Thu' | 'Fri', CanonicalTemplateDay> = {
  Mon: 'A',
  Tue: 'B',
  Thu: 'C',
  Fri: 'D',
};

/**
 * Kraft trip week (Block A W3, 2026-09-20…): Linda trains Day C on Wed 23 and
 * Day D on Thu 24. Fri 25 is massage — not a training day (no default D).
 * Sun 20 stays picker-driven (A then B). Normal weeks after this trip keep
 * Mon A / Tue B / Thu C / Fri D. Dated keys only — do not infer from weekday.
 */
export const TEMPLATE_DAY_DATE_OVERRIDE: Readonly<Record<string, CanonicalTemplateDay | 'rest'>> = {
  '2026-09-23': 'C',
  '2026-09-24': 'D',
  '2026-09-25': 'rest',
};

const LETTER_BY_UTC_WEEKDAY: Record<number, CanonicalTemplateDay | undefined> = {
  1: 'A',
  2: 'B',
  4: 'C',
  5: 'D',
};

function utcWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0)).getUTCDay();
}

/**
 * Default template letter for the date picker (null = rest / picker-driven).
 * Trip overrides win; otherwise Mon A / Tue B / Thu C / Fri D.
 */
export function defaultTemplateDayForDate(ymd: string): CanonicalTemplateDay | null {
  const mapped = calendarTemplateDay(ymd);
  return mapped === 'rest' ? null : mapped;
}

/** Calendar letter including rest — Health join + gym picker share this map. */
export function calendarTemplateDay(ymd: string): CanonicalTemplateDay | 'rest' {
  const day = ymd.slice(0, 10);
  const override = TEMPLATE_DAY_DATE_OVERRIDE[day];
  if (override) return override;
  return LETTER_BY_UTC_WEEKDAY[utcWeekday(day)] ?? 'rest';
}

export const TEMPLATE_DAY_LABELS: Record<CanonicalTemplateDay, string> = {
  A: 'Monday · Squat',
  B: 'Tuesday · Bench',
  C: 'Thursday · Deadlift',
  D: 'Friday · Bench volume',
};

export function isCanonicalTemplateDay(value: string): value is CanonicalTemplateDay {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

export function canonicalTemplateDay(day: TemplateDay): CanonicalTemplateDay {
  if (isCanonicalTemplateDay(day)) return day;
  return LETTER_BY_WEEKDAY[day];
}

export function weekdayFor(day: TemplateDay): 'Mon' | 'Tue' | 'Thu' | 'Fri' {
  return WEEKDAY_BY_LETTER[canonicalTemplateDay(day)];
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
