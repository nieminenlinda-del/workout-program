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
