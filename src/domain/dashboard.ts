import type { DayTemplate } from '../data/templates';
import { EXERCISE_CATALOG, type ExerciseId } from '../types/exercises';
import { isPlannedDeload, PLANNED_ATTEMPT_LABELS } from './cyclePlan';
import { dayTemplateForDate } from './programWeek';
import { plannedLiftSummary } from './workoutPreview';
import { calendarYmd, isLoggedWorkSet } from './lastPerformance';
import { isWarmupSet } from './sets';
import { addCalendarDays, mondayOnOrBefore, testWeekRole } from './testWeek';
import { calendarTemplateDay, canonicalTemplateDay } from './templateDay';
import { getMesocycleContext } from './phase2Calendar';
import { previewPhaseLabel } from './blockPreview';
import {
  BLOCK_B_TRAINING_MAXES,
  MESOCYCLE_WINDOWS,
  SEED_TRAINING_MAXES,
  TEST_DAY,
  TESTED_1RM,
  type TrainingMaxes,
} from '../types/phase2';
import type {
  BarPosition,
  CanonicalTemplateDay,
  LoggedLift,
  LoggedSet,
  PainArea,
  ReadinessLight,
  SessionLog,
} from '../types/session';
import { PAIN_AREA_LABELS } from '../types/session';

export { TESTED_1RM };

/** Sat 21 Nov 2026 backup. Dashboard plan only — `testWeekRole` stays null. */
export const TEST_BACKUP_DATE = '2026-11-21';

export const NEXT_GOAL = {
  label: 'Next goal (TBD)',
  options: [
    { name: 'FPO Tampere', when: '12–13 Dec', detail: 'full power' },
    { name: 'WPC Laitila', when: '12 Dec', detail: 'bench + deadlift' },
  ],
} as const;

/**
 * RTS / Tuchscherer percent of 1RM.
 * Index 0 is 1 rep … index 4 is 5 reps. RPE 6–10 in half steps.
 */
export const RTS_PERCENT: Record<number, readonly number[]> = {
  10: [100, 95.5, 92.2, 89.2, 86.3],
  9.5: [97.8, 93.9, 90.7, 87.8, 85],
  9: [95.5, 92.2, 89.2, 86.3, 83.7],
  8.5: [93.9, 90.7, 87.8, 85, 82.4],
  8: [92.2, 89.2, 86.3, 83.7, 81.1],
  7.5: [90.7, 87.8, 85, 82.4, 79.9],
  7: [89.2, 86.3, 83.7, 81.1, 78.6],
  6.5: [87.8, 85, 82.4, 79.9, 77.4],
  6: [86.3, 83.7, 81.1, 78.6, 76.2],
};

export type CompetitionLift = 'squat' | 'bench' | 'deadlift';

export const COMPETITION_LIFTS: readonly CompetitionLift[] = ['squat', 'bench', 'deadlift'];

export const LIFT_LABEL: Record<CompetitionLift, string> = {
  squat: 'Squat',
  bench: 'Bench',
  deadlift: 'Deadlift',
};

const PAUSED_BENCH_SLOT = 'c-paused-bench';

export function rtsPercent(reps: number, rpe: number): number | null {
  const row = RTS_PERCENT[rpe];
  if (!row || reps < 1 || reps > 5) return null;
  return row[reps - 1] ?? null;
}

/** Epley, only for a short set that has no RPE. */
export function epley1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export function estimate1rm(set: Pick<LoggedSet, 'weight_kg' | 'reps' | 'rpe'>): number | null {
  if (set.reps < 1 || set.reps > 5) return null;
  if (typeof set.rpe === 'number' && Number.isFinite(set.rpe)) {
    const pct = rtsPercent(set.reps, set.rpe);
    if (pct == null) return null;
    return set.weight_kg / (pct / 100);
  }
  return epley1rm(set.weight_kg, set.reps);
}

/** `B1`, `B2`, `Backoff`. A plain "Top" label is not a back-off. */
export function isBackoffSet(set: Pick<LoggedSet, 'part_label'>): boolean {
  const label = set.part_label?.trim() ?? '';
  if (!label) return false;
  if (/^b\d+$/i.test(label)) return true;
  return label.toLowerCase() === 'backoff';
}

export function isBarbellSquat(exerciseId: ExerciseId): boolean {
  const meta = EXERCISE_CATALOG[exerciseId];
  return meta.pattern === 'squat' && meta.equipment === 'barbell';
}

export function effectiveBarPosition(lift: Pick<LoggedLift, 'bar_position'>): BarPosition {
  return lift.bar_position === 'high_bar' ? 'high_bar' : 'low_bar';
}

/**
 * Competition lift for an estimated 1RM.
 * High-bar does not count as the low-bar squat. Paused bench, paused deadlift,
 * and close-grip do not count.
 */
export function estimateLift(lift: LoggedLift): CompetitionLift | null {
  if (lift.slot_id === PAUSED_BENCH_SLOT) return null;
  if (lift.exercise_id === 'deadlift_paused' || lift.exercise_id === 'bench_close_grip') return null;
  if (lift.exercise_id === 'squat_low_bar') {
    return effectiveBarPosition(lift) === 'high_bar' ? null : 'squat';
  }
  if (lift.exercise_id === 'bench_regular' || lift.exercise_id === 'bench_regular_volume') return 'bench';
  if (lift.exercise_id === 'deadlift_conventional') return 'deadlift';
  return null;
}

/** Hard-set bucket. High-bar still counts as squat work. Back-offs stay in. */
export function hardSetLift(lift: LoggedLift): CompetitionLift | null {
  if (lift.exercise_id === 'deadlift_paused' || lift.exercise_id === 'bench_close_grip') return null;
  if (lift.exercise_id === 'squat_low_bar') return 'squat';
  if (
    lift.exercise_id === 'bench_regular' ||
    lift.exercise_id === 'bench_regular_volume' ||
    lift.slot_id === PAUSED_BENCH_SLOT
  ) {
    return 'bench';
  }
  if (lift.exercise_id === 'deadlift_conventional') return 'deadlift';
  return null;
}

export function isEligibleEstimateSet(lift: LoggedLift, set: LoggedSet): boolean {
  if (!isLoggedWorkSet(set) || isWarmupSet(set)) return false;
  if (isBackoffSet(set)) return false;
  if (set.amrap && set.reps > 5) return false;
  if (set.reps < 1 || set.reps > 5) return false;
  if (estimateLift(lift) == null) return false;
  return estimate1rm(set) != null;
}

export function isHardSet(lift: LoggedLift, set: LoggedSet): boolean {
  if (!isLoggedWorkSet(set) || isWarmupSet(set)) return false;
  if (typeof set.rpe !== 'number' || set.rpe < 7) return false;
  return hardSetLift(lift) != null;
}

export interface EstimatePoint {
  date: string;
  estimate: number;
}

export function eligibleEstimates(logs: readonly SessionLog[], lift: CompetitionLift): EstimatePoint[] {
  const points: EstimatePoint[] = [];
  for (const session of logs) {
    const date = calendarYmd(session.date);
    if (!date) continue;
    for (const row of session.lifts) {
      if (estimateLift(row) !== lift) continue;
      for (const set of row.sets) {
        if (!isEligibleEstimateSet(row, set)) continue;
        const estimate = estimate1rm(set);
        if (estimate == null) continue;
        points.push({ date, estimate });
      }
    }
  }
  return points;
}

export interface RollingPoint {
  week: string;
  estimate: number;
}

/** Best eligible estimate in [weekMonday − 7 days, weekSunday]. Empty weeks are omitted. */
export function rollingTwoWeekBest(
  logs: readonly SessionLog[],
  lift: CompetitionLift,
  asOf?: string,
): RollingPoint[] {
  const samples = eligibleEstimates(logs, lift);
  if (samples.length === 0) return [];
  const dates = samples.map((sample) => sample.date).sort();
  const first = mondayOnOrBefore(dates[0] ?? '');
  const lastDate = asOf && calendarYmd(asOf) ? calendarYmd(asOf) : dates[dates.length - 1];
  const last = mondayOnOrBefore(lastDate || first);
  const points: RollingPoint[] = [];
  for (let week = first; week <= last; week = addCalendarDays(week, 7)) {
    const start = addCalendarDays(week, -7);
    const end = addCalendarDays(week, 6);
    let best: number | null = null;
    for (const sample of samples) {
      if (sample.date < start || sample.date > end) continue;
      if (best == null || sample.estimate > best) best = sample.estimate;
    }
    if (best != null) points.push({ week, estimate: best });
  }
  return points;
}

export interface AttemptMarks {
  opener: number;
  goalLow: number;
  goalHigh: number;
}

/** First attempt is the opener. The last token `77.5–80` is the goal band. */
export function marksFromAttemptLabel(label: string): AttemptMarks {
  const parts = label.split('/').map((part) => part.trim());
  const opener = Number(parts[0]);
  const goal = (parts[parts.length - 1] ?? '').split(/[–-]/).map((part) => Number(part.trim()));
  return {
    opener,
    goalLow: goal[0] ?? opener,
    goalHigh: goal[1] ?? goal[0] ?? opener,
  };
}

export function attemptMarksFor(lift: CompetitionLift): AttemptMarks {
  return marksFromAttemptLabel(PLANNED_ATTEMPT_LABELS[lift]);
}

export function testedKg(lift: CompetitionLift): number {
  if (lift === 'squat') return TESTED_1RM.squat_kg;
  if (lift === 'bench') return TESTED_1RM.bench_kg;
  return TESTED_1RM.deadlift_kg;
}

export function trainingMaxesAreSeparate(blockB: TrainingMaxes = BLOCK_B_TRAINING_MAXES): boolean {
  return (
    TESTED_1RM.bench_kg !== blockB.bench_kg &&
    TESTED_1RM.deadlift_kg !== blockB.deadlift_kg &&
    TESTED_1RM.squat_kg !== SEED_TRAINING_MAXES.squat_kg
  );
}

export interface HardSetCounts {
  squat: number;
  bench: number;
  deadlift: number;
}

export function hardSetsInWeek(logs: readonly SessionLog[], weekMonday: string): HardSetCounts {
  const counts: HardSetCounts = { squat: 0, bench: 0, deadlift: 0 };
  for (const session of sessionsInWeek(logs, weekMonday)) {
    for (const lift of session.lifts) {
      const bucket = hardSetLift(lift);
      if (!bucket) continue;
      for (const set of lift.sets) {
        if (isHardSet(lift, set)) counts[bucket] += 1;
      }
    }
  }
  return counts;
}

export function sessionsInWeek(logs: readonly SessionLog[], weekMonday: string): SessionLog[] {
  const end = addCalendarDays(weekMonday, 6);
  return logs.filter((session) => {
    const date = calendarYmd(session.date);
    return Boolean(date) && date >= weekMonday && date <= end;
  });
}

export function sessionCompletion(
  logs: readonly SessionLog[],
  weekMonday: string,
): { done: number; total: 4; days: Record<CanonicalTemplateDay, boolean> } {
  const days: Record<CanonicalTemplateDay, boolean> = { A: false, B: false, C: false, D: false };
  for (const session of sessionsInWeek(logs, weekMonday)) {
    days[canonicalTemplateDay(session.template_day)] = true;
  }
  const done = (['A', 'B', 'C', 'D'] as const).filter((day) => days[day]).length;
  return { done, total: 4, days };
}

export interface DayReadiness {
  date: string;
  weekday: string;
  light: ReadinessLight | null;
  isToday: boolean;
}

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

function utcWeekdayIndex(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function latestSessionOn(logs: readonly SessionLog[], date: string): SessionLog | null {
  const rows = logs.filter((session) => calendarYmd(session.date) === date);
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => (a.session_id < b.session_id ? 1 : -1))[0] ?? null;
}

export function readinessForWeek(logs: readonly SessionLog[], weekMonday: string, asOf: string): DayReadiness[] {
  const today = asOf.slice(0, 10);
  const days: DayReadiness[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addCalendarDays(weekMonday, i);
    const session = latestSessionOn(logs, date);
    days.push({
      date,
      weekday: WEEKDAY_SHORT[utcWeekdayIndex(date)] ?? '',
      light: session?.readiness.light ?? null,
      isToday: date === today,
    });
  }
  return days;
}

export interface SameLoadPoint {
  date: string;
  rpe: number;
}

export interface SameLoadSeries {
  lift: CompetitionLift;
  weight_kg: number;
  points: SameLoadPoint[];
}

interface TopSetSample {
  date: string;
  lift: CompetitionLift;
  weight_kg: number;
  reps: number;
  rpe: number;
}

function topSetsBySession(logs: readonly SessionLog[]): TopSetSample[] {
  const samples: TopSetSample[] = [];
  for (const session of logs) {
    const date = calendarYmd(session.date);
    if (!date) continue;
    const best = new Map<CompetitionLift, LoggedSet>();
    for (const lift of session.lifts) {
      const bucket = estimateLift(lift);
      if (!bucket) continue;
      for (const set of lift.sets) {
        if (!isEligibleEstimateSet(lift, set)) continue;
        const current = best.get(bucket);
        if (
          !current ||
          set.weight_kg > current.weight_kg ||
          (set.weight_kg === current.weight_kg && set.reps >= current.reps)
        ) {
          best.set(bucket, set);
        }
      }
    }
    for (const [lift, set] of best) {
      samples.push({ date, lift, weight_kg: set.weight_kg, reps: set.reps, rpe: set.rpe });
    }
  }
  return samples;
}

/** Top-set RPE at the weight that has been logged most often. Ties go to the newer weight. */
export function sameLoadSeries(logs: readonly SessionLog[]): SameLoadSeries | null {
  const samples = topSetsBySession(logs);
  if (samples.length === 0) return null;
  const groups = new Map<string, TopSetSample[]>();
  for (const sample of samples) {
    const key = `${sample.lift}:${sample.weight_kg}`;
    const list = groups.get(key) ?? [];
    list.push(sample);
    groups.set(key, list);
  }
  let chosen: TopSetSample[] | null = null;
  for (const group of groups.values()) {
    if (!chosen) {
      chosen = group;
      continue;
    }
    const newer = [...group].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date ?? '';
    const chosenNewer = [...chosen].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date ?? '';
    if (group.length > chosen.length || (group.length === chosen.length && newer > chosenNewer)) {
      chosen = group;
    }
  }
  if (!chosen || chosen.length === 0) return null;
  const sorted = [...chosen].sort((a, b) => a.date.localeCompare(b.date));
  return {
    lift: sorted[0].lift,
    weight_kg: sorted[0].weight_kg,
    points: sorted.map((sample) => ({ date: sample.date, rpe: sample.rpe })),
  };
}

export interface PainEntry {
  date: string;
  area: PainArea;
  label: string;
  note: string;
}

export function painEntries(logs: readonly SessionLog[]): PainEntry[] {
  const rows: PainEntry[] = [];
  for (const session of logs) {
    if (!session.pain_area) continue;
    const date = calendarYmd(session.date);
    if (!date) continue;
    rows.push({
      date,
      area: session.pain_area,
      label: PAIN_AREA_LABELS[session.pain_area],
      note: session.pain_note?.trim() ?? '',
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function latestSquatBar(logs: readonly SessionLog[]): { date: string; position: BarPosition } | null {
  const dated = logs
    .map((session) => ({ session, date: calendarYmd(session.date) }))
    .filter((row): row is { session: SessionLog; date: string } => Boolean(row.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const row of dated) {
    const squat = row.session.lifts.find((lift) => lift.exercise_id === 'squat_low_bar');
    if (!squat) continue;
    return { date: row.date, position: effectiveBarPosition(squat) };
  }
  return null;
}

export interface TargetLine {
  name: string;
  load: string;
}

export interface WeekTargetDay {
  date: string;
  heading: string;
  lines: TargetLine[];
}

export function thisWeekTargets(asOf: string): WeekTargetDay[] {
  const week = mondayOnOrBefore(asOf.slice(0, 10));
  const days: WeekTargetDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addCalendarDays(week, i);
    if (date === TEST_BACKUP_DATE) continue;
    const isTest = date === TEST_DAY || testWeekRole(date) === 'test';
    const mapped = calendarTemplateDay(date);
    if (!isTest && mapped === 'rest') continue;
    const template = dayTemplateForDate(isTest ? 'A' : mapped === 'rest' ? 'A' : mapped, date);
    const lines = template.slots
      .filter((slot) => slot.role === 'T1')
      .map((slot) => {
        const summary = plannedLiftSummary(slot);
        const work = slot.sets.filter((set) => !set.warmup);
        const rpe = work[0]?.rpe_label ?? (work[0] ? String(work[0].rpe) : '');
        return {
          name: summary.name,
          load: rpe ? `${summary.workLabel} @ ${rpe}` : summary.workLabel,
        };
      });
    days.push({
      date,
      heading: `${weekdayName(date)} ${dayMonth(date)}`,
      lines,
    });
  }
  return days;
}

export type TimelineBadge = 'plan' | 'current' | 'deload' | 'gap';

export interface TimelineDay {
  label: string;
  date: string;
  kind: 'train' | 'rest' | 'today' | 'test';
}

export interface TimelineWeek {
  id: string;
  title: string;
  badge: string;
  badgeKind: TimelineBadge;
  note: string | null;
  days: TimelineDay[] | null;
  lines: string[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function dayMonth(ymd: string): string {
  const [, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** English day-month, independent of the phone locale. */
export function formatDayMonth(ymd: string): string {
  return dayMonth(ymd);
}

function weekdayName(ymd: string): string {
  return WEEKDAY_NAME[utcWeekdayIndex(ymd)] ?? '';
}

export function formatWeekRange(start: string, end: string): string {
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  if (sm === em) return `${sd}–${ed} ${MONTHS[(sm ?? 1) - 1]}`;
  return `${sd} ${MONTHS[(sm ?? 1) - 1]}–${ed} ${MONTHS[(em ?? 1) - 1]}`;
}

export function daysUntil(asOf: string, target: string): number {
  const [ay, am, ad] = asOf.slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = target.slice(0, 10).split('-').map(Number);
  const a = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
  const b = Date.UTC(by, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((b - a) / 86_400_000);
}

function weekDays(start: string, asOf: string): TimelineDay[] {
  const today = asOf.slice(0, 10);
  const days: TimelineDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addCalendarDays(start, i);
    const mapped = calendarTemplateDay(date);
    const isTest = date === TEST_DAY;
    let kind: TimelineDay['kind'] = mapped === 'rest' && !isTest ? 'rest' : 'train';
    if (isTest) kind = 'test';
    if (date === today) kind = 'today';
    days.push({
      label: WEEKDAY_SHORT[utcWeekdayIndex(date)] ?? '',
      date: String(Number(date.slice(8, 10))),
      kind,
    });
  }
  return days;
}

export function dashboardTimeline(asOf: string): TimelineWeek[] {
  const today = asOf.slice(0, 10);
  const weeks: TimelineWeek[] = [];
  for (const window of MESOCYCLE_WINDOWS) {
    if (window.block === 'A') continue;
    let cursor = window.start;
    let index = 1;
    while (cursor <= window.end) {
      const weekEnd = addCalendarDays(cursor, 6);
      const isTestWeek = cursor === mondayOnOrBefore(TEST_DAY);
      const current = today >= cursor && today <= (weekEnd < window.end ? weekEnd : window.end);
      const deload = isPlannedDeload(window.block, index);
      const phase = previewPhaseLabel(getMesocycleContext(cursor).phase ?? window.defaultPhase);
      let id = `${window.block}${index}`;
      let badge: string = phase;
      let badgeKind: TimelineBadge = current ? 'current' : 'plan';
      let note: string | null = null;
      const lines: string[] = [];
      if (deload) {
        badge = 'Deload';
        badgeKind = 'deload';
        note = 'From this Monday. Top sets at RPE 5–6.';
      }
      if (window.block === 'C' && index === 2) {
        note = 'Progression is frozen. Non-T1 slots drop off.';
      }
      if (isTestWeek) {
        id = 'Test';
        badge = 'Test week';
        badgeKind = current ? 'current' : 'plan';
        const opener = dayTemplateForDate('A', cursor);
        const pullDate = addCalendarDays(cursor, 1);
        const pull = dayTemplateForDate('C', pullDate);
        lines.push(`${weekdayName(cursor)} ${dayMonth(cursor)} light · ${t1Brief(opener)}`);
        lines.push(`${weekdayName(pullDate)} ${dayMonth(pullDate)} light · ${t1Brief(pull)}`);
        lines.push(`${weekdayName(addCalendarDays(cursor, 2))}–${weekdayName(addCalendarDays(cursor, 3))} rest`);
        lines.push(`${weekdayName(TEST_DAY)} ${dayMonth(TEST_DAY)} 1RM test · squat, then bench, then deadlift`);
        lines.push(`${weekdayName(TEST_BACKUP_DATE)} ${dayMonth(TEST_BACKUP_DATE)} backup`);
        note = null;
      }
      weeks.push({
        id,
        title: isTestWeek ? formatWeekRange(cursor, addCalendarDays(cursor, 6)) : formatWeekRange(cursor, weekEnd > window.end ? window.end : weekEnd),
        badge: current && !isTestWeek ? 'This week' : badge,
        badgeKind: current ? (deload ? 'deload' : 'current') : badgeKind,
        note,
        days: current ? weekDays(cursor, today) : null,
        lines,
      });
      if (isTestWeek) break;
      cursor = addCalendarDays(cursor, 7);
      index += 1;
    }
  }
  weeks.push({
    id: 'Next',
    title: 'Next goal',
    badge: 'TBD',
    badgeKind: 'gap',
    note: 'After the test, the mode hook returns to hypertrophy. These meets are not on the training calendar.',
    days: null,
    lines: NEXT_GOAL.options.map((option) => `${option.name} ${option.when} · ${option.detail}`),
  });
  return weeks;
}

function t1Brief(template: DayTemplate): string {
  return template.slots
    .filter((slot) => slot.role === 'T1')
    .map((slot) => {
      const summary = plannedLiftSummary(slot);
      const short = summary.name.replace('Low-bar ', '').replace('Conventional ', '');
      return `${short} ${summary.workLabel.replace(' kg', '')}`;
    })
    .join(', ');
}

export function dashboardPhaseLabel(asOf: string): string {
  const meso = getMesocycleContext(asOf);
  if (!meso.block || !meso.phase || meso.weekIndex == null) {
    return meso.training_mode === 'strength_peak' ? 'Strength peak' : 'Hypertrophy';
  }
  const phase = previewPhaseLabel(meso.phase);
  const deload = isPlannedDeload(meso.block, meso.weekIndex) ? ' · deload' : '';
  return `Block ${meso.block} · week ${meso.weekIndex} · ${phase}${deload}`;
}
