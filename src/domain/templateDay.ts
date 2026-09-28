import type { CanonicalTemplateDay, TemplateDay } from '../types/session';
import { TEST_DAY } from '../types/phase2';
import { testWeekRole } from './testWeek';

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
  // Block C week 2: deadlift moves to Wednesday so it is done early.
  '2026-11-11': 'C',
  '2026-11-12': 'rest',
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
 * Today opens Day C on Wed 30 Sep 2026 so the Week 4 deadlift is on screen
 * if she trains that morning. Thursday stays the scheduled Day C
 * (`calendarTemplateDay`); this date is not a second preview session.
 */
export const BLOCK_A_WEEK4_DL_OPEN_DATE = '2026-09-30';

/**
 * Default template letter for the date picker (null = rest / picker-driven).
 * Trip overrides win; otherwise Mon A / Tue B / Thu C / Fri D.
 * Wed 30 Sep 2026 opens Day C (Week 4 deadlift) without listing that day twice.
 */
export function defaultTemplateDayForDate(ymd: string): CanonicalTemplateDay | null {
  const day = ymd.slice(0, 10);
  if (day === BLOCK_A_WEEK4_DL_OPEN_DATE) return 'C';
  const mapped = calendarTemplateDay(day);
  return mapped === 'rest' ? null : mapped;
}

/**
 * Calendar letter including rest — Health join + gym picker share this map.
 * `testDate` selects the Saturday or Friday test-week layout. Default is Saturday 21 Nov.
 */
export function calendarTemplateDay(
  ymd: string,
  testDate: string = TEST_DAY,
): CanonicalTemplateDay | 'rest' {
  const day = ymd.slice(0, 10);
  const role = testWeekRole(day, testDate);
  if (role === 'rest' || role === 'test') return 'rest';
  if (role === 'opener') return 'A';
  if (role === 'pull') return 'C';
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
