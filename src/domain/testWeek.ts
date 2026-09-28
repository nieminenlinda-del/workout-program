import { MESOCYCLE_WINDOWS, TEST_DAY } from '../types/phase2';

export type TestWeekRole = 'opener' | 'pull' | 'rest' | 'test';

export function mondayOnOrBefore(ymd: string): string {
  const date = utcDate(ymd);
  const wd = date.getUTCDay();
  const delta = wd === 0 ? -6 : 1 - wd;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(ymd: string, days: number): string {
  const date = utcDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Test week relative to `testDate` (`TEST_DAY`, Fri 20 Nov 2026).
 *
 * Monday of that week is squat + bench, the next day is deadlift + bench,
 * the days after that are rest, and `testDate` is the test.
 * Null when `ymd` is outside Monday-of-test-week … test day.
 */
export function testWeekRole(ymd: string, testDate: string = TEST_DAY): TestWeekRole | null {
  const day = ymd.slice(0, 10);
  const test = testDate.slice(0, 10);
  const monday = mondayOnOrBefore(test);
  if (day < monday || day > test) return null;
  if (day === test) return 'test';
  const offset = diffDays(monday, day);
  if (offset === 0) return 'opener';
  if (offset === 1) return 'pull';
  return 'rest';
}

/** Block C from the week before the test week through the test day. C1 stays open. */
export function isProgressionFrozen(ymd: string, testDate: string = TEST_DAY): boolean {
  const day = ymd.slice(0, 10);
  const test = testDate.slice(0, 10);
  const blockC = MESOCYCLE_WINDOWS.find((window) => window.block === 'C');
  if (!blockC || day < blockC.start || day > blockC.end) return false;
  if (day === test) return true;
  const c2Start = addCalendarDays(mondayOnOrBefore(test), -7);
  return day >= c2Start && day <= test;
}

function utcDate(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function diffDays(start: string, end: string): number {
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000);
}
