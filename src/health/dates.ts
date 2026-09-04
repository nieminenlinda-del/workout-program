import { HEALTH_TZ } from './constants';

const APPLE_DATE =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)? ?([+-])(\d{2}):?(\d{2})$/;

export function parseHealthDate(raw: string): Date {
  const trimmed = raw.trim();
  const apple = trimmed.match(APPLE_DATE);
  if (apple) {
    const [, date, time, sign, hh, mm] = apple;
    return new Date(`${date}T${time}${sign}${hh}:${mm}`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unparseable Health date: ${raw}`);
  }
  return parsed;
}

export function tryParseHealthDate(raw: string): Date | null {
  try {
    const parsed = parseHealthDate(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export function healthDateToIso(raw: string): string {
  return parseHealthDate(raw).toISOString();
}

/** YYYY-MM-DD in Europe/Helsinki. */
export function helsinkiDay(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for Helsinki day: ${String(value)}`);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HEALTH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function helsinkiToday(now = new Date()): string {
  return helsinkiDay(now);
}

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function helsinkiHour(date: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: HEALTH_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0);
}

/** Instant of 00:00:00 on `ymd` in Europe/Helsinki. */
export function startOfHelsinkiDay(ymd: string): Date {
  for (const offset of ['+03:00', '+02:00'] as const) {
    const candidate = new Date(`${ymd}T00:00:00${offset}`);
    if (helsinkiDay(candidate) === ymd && helsinkiHour(candidate) === 0) {
      return candidate;
    }
  }
  return new Date(`${ymd}T00:00:00+03:00`);
}

export function startOfHelsinkiDayIso(ymd: string): string {
  return startOfHelsinkiDay(ymd).toISOString();
}

export function endOfHelsinkiDayIso(ymd: string): string {
  return new Date(startOfHelsinkiDay(addCalendarDays(ymd, 1)).getTime() - 1).toISOString();
}

export function parseDateComponents(raw: string): string | null {
  const match = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Weekday of a civil YYYY-MM-DD (timezone-independent).
 * 0 = Sunday … 6 = Saturday.
 */
export function weekdayOfYmd(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0)).getUTCDay();
}
