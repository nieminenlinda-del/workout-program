import { exerciseName, type TemplateSlot } from '../data/templates';
import { isAssistedLoad, isTimedHold, type ExerciseId } from '../types/exercises';
import type { CanonicalTemplateDay, SessionLog } from '../types/session';
import {
  MESOCYCLE_WINDOWS,
  TARGET_TEST_DATE,
  TEST_LIFT_ORDER,
  type BlockPhase,
  type MesocycleBlock,
  type TestLift,
} from '../types/phase2';
import { calendarYmd, isLoggedWorkSet } from './lastPerformance';
import { getMesocycleContext } from './phase2Calendar';
import { blockWeekContext, dayTemplateForDate } from './programWeek';
import { workSets } from './sets';
import { calendarTemplateDay, canonicalTemplateDay } from './templateDay';
import { formatLoad } from './formatLoad';
import { plannedLiftSummary, type PlannedLiftSummary } from './workoutPreview';

/**
 * Read-only plan from the current product week through the 1RM test.
 *
 * Phases (display only — does not change `getMesocycleContext`):
 * - accumulate → Hypertrophy (Block A)
 * - intensify → Strength (Block B)
 * - peak_overreach and peak_taper → Peak (Block C)
 * - test → Test (21 Nov)
 *
 * Home still shows PowerCombo `training_mode` strength_peak for this whole
 * cycle. That mode is not the week phase.
 *
 * Loads: `dayTemplateForDate` → `applyProgramWeek` → `t1PrescriptionFor`,
 * the same weekly targets as Today and `createDraftSession`. Block A week 4
 * is the deload row. A later Block A week would hold Week 3. Blocks B–C have
 * no Kraft table, so T1s stay on the seed template. Sessions after `asOf` are
 * marked projected. The test day does not invent attempt weights
 * (`t1PrescriptionFor` has none).
 */
export const PREVIEW_PHASE_LABEL: Record<BlockPhase, 'Hypertrophy' | 'Strength' | 'Peak' | 'Test'> = {
  accumulate: 'Hypertrophy',
  intensify: 'Strength',
  peak_overreach: 'Peak',
  peak_taper: 'Peak',
  test: 'Test',
};

const TEST_EXERCISE: Record<TestLift, ExerciseId> = {
  squat: 'squat_low_bar',
  bench: 'bench_regular',
  deadlift: 'deadlift_conventional',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const DAY_SORT: Record<CanonicalTemplateDay | 'test', number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  test: 4,
};

export function previewPhaseLabel(phase: BlockPhase): (typeof PREVIEW_PHASE_LABEL)[BlockPhase] {
  return PREVIEW_PHASE_LABEL[phase];
}

export interface BlockPreviewExercise {
  slotId: string;
  role: TemplateSlot['role'];
  name: string;
  optional: boolean;
  workLabel: string;
  rpeLabel: string;
  warmupLabel: string | null;
  note: string | null;
  projected: boolean;
}

export interface BlockPreviewLogLine {
  name: string;
  line: string;
}

export interface BlockPreviewSession {
  date: string;
  kind: 'train' | 'test';
  templateDay: CanonicalTemplateDay | 'test';
  heading: string;
  title: string;
  phaseLabel: (typeof PREVIEW_PHASE_LABEL)[BlockPhase];
  projected: boolean;
  /** Peak taper: progression is frozen. Load is still the weekly target. */
  frozen: boolean;
  completed: boolean;
  exercises: BlockPreviewExercise[];
  testNote: string | null;
  logged: BlockPreviewLogLine[];
}

export interface BlockPreviewWeek {
  id: string;
  block: MesocycleBlock;
  weekIndex: number;
  /** Matches the Home chip: `Block A · Week 3`. */
  label: string;
  start: string;
  end: string;
  rangeLabel: string;
  phaseLabel: string;
  /** Block A Week 4 only. Block B/C week 4 is not this deload. */
  deload: boolean;
  current: boolean;
  /** Every session in the week has a saved log. */
  completed: boolean;
  /** Every session is after `asOf`. */
  projected: boolean;
  sessions: BlockPreviewSession[];
}

export function formatWorkRpe(
  sets: readonly { rpe: number; warmup?: boolean; rpe_label?: string }[],
): string {
  const work = workSets(sets);
  if (work.length === 0) return '';
  const band = work.every((set) => set.rpe_label && set.rpe_label === work[0]?.rpe_label)
    ? work[0]?.rpe_label
    : undefined;
  if (band) return `RPE ${band}`;
  const values = work.map((set) => set.rpe);
  const unique = [...new Set(values)];
  if (unique.length === 1) return `RPE ${unique[0]}`;
  return `RPE ${values.join(', ')}`;
}

export function formatWeekRange(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8))}–${formatDayMonth(end)}`;
  }
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
}

/** Product weeks from the week containing `asOf` through the test date. */
export function buildBlockPreview(
  asOf: string,
  logs: readonly SessionLog[] = [],
  testDate: string = TARGET_TEST_DATE,
): BlockPreviewWeek[] {
  const today = calendarYmd(asOf) || asOf.slice(0, 10);
  const end = calendarYmd(testDate) || testDate.slice(0, 10);
  const start = previewStart(today, end);
  if (!start || start > end) return [];

  const used = new Set<string>();
  const weeks: BlockPreviewWeek[] = [];
  let draft: WeekDraft | null = null;

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const ctx = blockWeekContext(cursor);
    if (!ctx) continue;
    if (!draft || draft.block !== ctx.block || draft.weekIndex !== ctx.weekIndex) {
      if (draft) weeks.push(finishWeek(draft, today));
      draft = {
        block: ctx.block,
        weekIndex: ctx.weekIndex,
        start: cursor,
        end: cursor,
        sessions: [],
      };
    }
    draft.end = cursor;
    const session = sessionForDate(cursor, today, logs, used);
    if (session) draft.sessions.push(session);
  }
  if (draft) weeks.push(finishWeek(draft, today));

  for (const week of weeks) {
    const extras = extraLoggedSessions(week, logs, used, today);
    if (extras.length === 0) continue;
    week.sessions = [...week.sessions, ...extras].sort(compareSessions);
    week.completed = week.sessions.length > 0 && week.sessions.every((session) => session.completed);
    week.projected = week.sessions.length > 0 && week.sessions.every((session) => session.projected);
    week.phaseLabel = phaseLabelFor(week.sessions);
  }

  return weeks;
}

interface WeekDraft {
  block: MesocycleBlock;
  weekIndex: number;
  start: string;
  end: string;
  sessions: BlockPreviewSession[];
}

function finishWeek(draft: WeekDraft, today: string): BlockPreviewWeek {
  const todayCtx = blockWeekContext(today);
  const sessions = [...draft.sessions].sort(compareSessions);
  return {
    id: `${draft.block}-${draft.weekIndex}`,
    block: draft.block,
    weekIndex: draft.weekIndex,
    label: `Block ${draft.block} · Week ${draft.weekIndex}`,
    start: draft.start,
    end: draft.end,
    rangeLabel: formatWeekRange(draft.start, draft.end),
    phaseLabel: phaseLabelFor(sessions),
    deload: draft.block === 'A' && draft.weekIndex === 4,
    current: todayCtx?.block === draft.block && todayCtx.weekIndex === draft.weekIndex,
    completed: sessions.length > 0 && sessions.every((session) => session.completed),
    projected: sessions.length > 0 && sessions.every((session) => session.projected),
    sessions,
  };
}

function phaseLabelFor(sessions: readonly BlockPreviewSession[]): string {
  const labels: string[] = [];
  for (const session of sessions) {
    if (!labels.includes(session.phaseLabel)) labels.push(session.phaseLabel);
  }
  return labels.join(' · ');
}

function sessionForDate(
  date: string,
  today: string,
  logs: readonly SessionLog[],
  used: Set<string>,
): BlockPreviewSession | null {
  const meso = getMesocycleContext(date);
  if (meso.isTestDay) return testSession(date, today, logs, used);

  const mapped = calendarTemplateDay(date);
  if (mapped === 'rest') return null;
  return trainSession(date, mapped, today, logs, used);
}

function trainSession(
  date: string,
  day: CanonicalTemplateDay,
  today: string,
  logs: readonly SessionLog[],
  used: Set<string>,
): BlockPreviewSession {
  const meso = getMesocycleContext(date);
  const template = dayTemplateForDate(day, date);
  const projected = date > today;
  const log = claimLog(logs, date, day, used);
  const summaries = template.slots.map((slot) => plannedLiftSummary(slot));
  return {
    date,
    kind: 'train',
    templateDay: day,
    heading: `${weekdayShort(date)} ${formatDayMonth(date)} · Day ${day}`,
    title: template.title,
    phaseLabel: previewPhaseLabel(meso.phase ?? 'accumulate'),
    projected,
    frozen: Boolean(meso.freezeProgression && !meso.isTestDay),
    completed: log != null,
    exercises: summaries.map((summary) => exerciseFromSummary(summary, projected)),
    testNote: null,
    logged: log ? loggedLines(log) : [],
  };
}

function testSession(
  date: string,
  today: string,
  logs: readonly SessionLog[],
  used: Set<string>,
): BlockPreviewSession {
  const log = claimLog(logs, date, 'test', used);
  return {
    date,
    kind: 'test',
    templateDay: 'test',
    heading: `${weekdayShort(date)} ${formatDayMonth(date)} · 1RM test`,
    title: TEST_LIFT_ORDER.map((lift) => exerciseName(TEST_EXERCISE[lift])).join(' → '),
    phaseLabel: 'Test',
    projected: date > today,
    frozen: true,
    completed: log != null,
    exercises: [],
    testNote:
      'Squat, then bench, then deadlift. No accessories. Attempt weights are not programmed — progression is frozen, and the weekly target table has no test-day loads.',
    logged: log ? loggedLines(log) : [],
  };
}

function exerciseFromSummary(summary: PlannedLiftSummary, projected: boolean): BlockPreviewExercise {
  return {
    slotId: summary.slot_id,
    role: summary.role,
    name: summary.name,
    optional: summary.optional,
    workLabel: summary.workLabel,
    rpeLabel: formatWorkRpe(summary.sets),
    warmupLabel: summary.warmupLabel,
    note: summary.note,
    projected,
  };
}

function extraLoggedSessions(
  week: BlockPreviewWeek,
  logs: readonly SessionLog[],
  used: Set<string>,
  today: string,
): BlockPreviewSession[] {
  const extras: BlockPreviewSession[] = [];
  for (const log of logs) {
    if (used.has(log.session_id)) continue;
    const date = calendarYmd(log.date);
    if (!date || date < week.start || date > week.end) continue;
    const day = canonicalTemplateDay(log.template_day);
    extras.push(trainSession(date, day, today, logs, used));
  }
  return extras;
}

function claimLog(
  logs: readonly SessionLog[],
  date: string,
  day: CanonicalTemplateDay | 'test',
  used: Set<string>,
): SessionLog | null {
  const rows = logs.filter((row) => !used.has(row.session_id) && calendarYmd(row.date) === date);
  if (rows.length === 0) return null;
  const pool =
    day === 'test' ? rows : rows.filter((row) => canonicalTemplateDay(row.template_day) === day);
  if (pool.length === 0) return null;
  const match = [...pool].sort((a, b) => b.session_id.localeCompare(a.session_id))[0] ?? null;
  if (!match) return null;
  for (const row of pool) used.add(row.session_id);
  return match;
}

function loggedLines(session: SessionLog): BlockPreviewLogLine[] {
  const lines: BlockPreviewLogLine[] = [];
  for (const lift of session.lifts) {
    const work = lift.sets.filter((set) => isLoggedWorkSet(set));
    if (work.length === 0) continue;
    const timed = isTimedHold(lift.exercise_id);
    const assisted = isAssistedLoad(lift.exercise_id);
    const line = work
      .map((set) => {
        const reps = `${set.reps}${timed ? 's' : ''}${set.amrap ? '+' : ''}`;
        return `${formatLoad(set.weight_kg, assisted)} × ${reps} @ ${set.rpe}`;
      })
      .join(', ');
    lines.push({ name: lift.name, line });
  }
  return lines;
}

function compareSessions(a: BlockPreviewSession, b: BlockPreviewSession): number {
  return a.date.localeCompare(b.date) || DAY_SORT[a.templateDay] - DAY_SORT[b.templateDay];
}

function previewStart(today: string, end: string): string | null {
  if (today > end) return null;
  if (blockWeekContext(today)) return productWeekStart(today);
  const first = MESOCYCLE_WINDOWS[0]?.start;
  if (first && today < first) return first;
  return productWeekStart(end);
}

function productWeekStart(day: string): string {
  const ctx = blockWeekContext(day);
  if (!ctx) return day;
  let cursor = day;
  for (let i = 0; i < 14; i += 1) {
    const prev = addDays(cursor, -1);
    const prevCtx = blockWeekContext(prev);
    if (!prevCtx || prevCtx.block !== ctx.block || prevCtx.weekIndex !== ctx.weekIndex) return cursor;
    cursor = prev;
  }
  return cursor;
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay()] ?? '';
}

function formatDayMonth(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ''}`;
}
