import type { SessionRepository } from '../db/repository';
import type { ExerciseId } from '../types/exercises';
import { EXERCISE_CATALOG, exerciseEquipment } from '../types/exercises';
import {
  DEFAULT_READINESS,
  type LoggedLift,
  type LoggedSet,
  type SessionDraft,
} from '../types/session';
import { calendarYmd } from './lastPerformance';
import { canonicalTemplateDay } from './templateDay';
import { isWarmupSet } from './sets';
import { withComputedLight } from './readiness';

export const NOV23_DATE = '2026-11-23';
export const NOV23_SESSION_ID = 'linda-lift-2026-11-23-A';
export const NOV23_REPAIR_MARKER = 'linda-lift-nov23-repair';
const NOV23_SEEN_KEY = 'linda-lift-nov23-seen';

const KNEE_NOTE = 'Knee sleeves. Low-bar squat. Belt on set 3 only.';

/**
 * V9 only rewrote a row when this was true. A Helsinki 23 Nov timestamp can
 * fall on 22 Nov UTC, and a stored label such as "Monday · Squat" is not the
 * letter A, so the phone kept the old row and could add a second one beside it.
 */
export function isNov23DayA(session: { date?: string; template_day?: string }): boolean {
  return calendarYmd(session.date) === NOV23_DATE && canonicalTemplateDay(session.template_day as 'A') === 'A';
}

/** Calendar day in Europe/Helsinki. A date-only string is already a gym day. */
export function helsinkiCalendarDay(value: string | undefined | null): string {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/23\s*nov/i.test(raw) && /2026/.test(raw)) return NOV23_DATE;
  if (/nov(?:ember)?\.?\s*23\b/i.test(raw) && /2026/.test(raw)) return NOV23_DATE;
  if (/[T\s]\d{1,2}:\d{2}/.test(raw)) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Helsinki',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(parsed));
      const year = parts.find((part) => part.type === 'year')?.value;
      const month = parts.find((part) => part.type === 'month')?.value;
      const day = parts.find((part) => part.type === 'day')?.value;
      if (year && month && day) return `${year}-${month}-${day}`;
    }
  }
  return calendarYmd(raw);
}

export function isNov23StoredSession(session: { date?: string } | null | undefined): boolean {
  return helsinkiCalendarDay(session?.date) === NOV23_DATE;
}

function work(weight_kg: number, reps: number, rpe?: number, extra: Partial<LoggedSet> = {}): LoggedSet {
  return {
    weight_kg,
    reps,
    ...(rpe != null ? { rpe } : {}),
    completed: true,
    amrap: false,
    target_weight_kg: weight_kg,
    target_reps: reps,
    ...extra,
  };
}

function lift(
  exerciseId: ExerciseId,
  sets: LoggedSet[],
  extra: Partial<LoggedLift> = {},
): LoggedLift {
  const meta = EXERCISE_CATALOG[exerciseId];
  return {
    name: extra.name ?? meta.name,
    style: meta.style,
    exercise_id: exerciseId,
    equipment: exerciseEquipment(exerciseId),
    sets,
    ...extra,
  };
}

/** Full Mon 23 Day A. Squat RPEs on sets 1–2 can be filled from the phone. */
export function nov23DayASession(sessionId = NOV23_SESSION_ID, squatRpes: Array<number | undefined> = []): SessionDraft {
  return {
    session_id: sessionId,
    date: NOV23_DATE,
    template_day: 'A',
    readiness: withComputedLight(DEFAULT_READINESS),
    pain_flag: false,
    pain_note: '',
    notes: KNEE_NOTE,
    status: 'complete',
    updated_at: '2026-11-23T18:00:00.000Z',
    lifts: [
      lift(
        'squat_low_bar',
        [
          work(55, 5, squatRpes[0]),
          work(55, 5, squatRpes[1]),
          work(55, 5, 8.5, { part_label: 'Belt' }),
        ],
        { bar_position: 'low_bar', bar_kg: 20 },
      ),
      lift(
        'squat_low_bar_paused',
        [work(45, 3), work(45, 3)],
        { name: 'Paused squat (2 s pause)', bar_position: 'low_bar', bar_kg: 20 },
      ),
      lift('bench_regular', [work(45, 4), work(45, 4), work(45, 4)], { bar_kg: 20 }),
      lift('ab_rollout', [work(0, 8), work(0, 8), work(0, 8)], {
        name: 'Ab rollout from knees',
      }),
    ],
  };
}

function storedRpe(set: { rpe?: unknown } | undefined): number | undefined {
  return typeof set?.rpe === 'number' && Number.isFinite(set.rpe) ? set.rpe : undefined;
}

function isSquatRow(row: { name?: string; exercise_id?: string }): boolean {
  const name = (row.name ?? '').trim().toLowerCase();
  const id = (row.exercise_id ?? '').trim().toLowerCase();
  if (/pause/.test(name) || /pause/.test(id)) return false;
  if (id === 'squat_low_bar' || id === 'squat' || id === 'back_squat') return true;
  return name === 'squat' || name === 'back squat' || /low[-\s]?bar squat/.test(name);
}

function squatWorkSets(session: { lifts?: ReadonlyArray<{ name?: string; exercise_id?: string; sets?: LoggedSet[] }> } | null | undefined): LoggedSet[] {
  const rows = (session?.lifts ?? []).filter(isSquatRow);
  const ranked = rows
    .map((row) => (row.sets ?? []).filter((set) => set.completed !== false && !isWarmupSet(set)))
    .sort((a, b) => b.length - a.length);
  return ranked[0] ?? [];
}

function sameWork(
  sets: LoggedSet[],
  expected: Array<{ weight_kg: number; reps: number; rpe?: number; part_label?: string }>,
): boolean {
  if (sets.length !== expected.length) return false;
  return expected.every((want, index) => {
    const set = sets[index];
    if (!set) return false;
    if (set.weight_kg !== want.weight_kg || set.reps !== want.reps) return false;
    if (want.rpe == null ? set.rpe != null : set.rpe !== want.rpe) return false;
    if ((set.part_label ?? undefined) !== want.part_label) return false;
    return true;
  });
}

function workSetsOf(session: SessionDraft | null | undefined, exerciseId: ExerciseId): LoggedSet[] {
  const row = session?.lifts.find((item) => item.exercise_id === exerciseId);
  return row?.sets.filter((set) => set.completed && !isWarmupSet(set)) ?? [];
}

/** The stored row already matches the gym session, including any kept squat RPEs. */
export function nov23SessionIsComplete(session: SessionDraft | null | undefined): boolean {
  if (!session || !isNov23StoredSession(session)) return false;
  if (!/knee sleeves/i.test(session.notes ?? '')) return false;
  const squat = workSetsOf(session, 'squat_low_bar');
  if (squat.length !== 3) return false;
  if (squat.some((set) => set.weight_kg !== 55 || set.reps !== 5)) return false;
  if (squat[2]?.rpe !== 8.5 || squat[2]?.part_label !== 'Belt') return false;
  const paused = session.lifts.find((item) => item.exercise_id === 'squat_low_bar_paused');
  const rollout = session.lifts.find((item) => item.exercise_id === 'ab_rollout');
  if (!paused || !/2\s*s/i.test(paused.name)) return false;
  if (!rollout || !/knee/i.test(rollout.name)) return false;
  return (
    sameWork(workSetsOf(session, 'squat_low_bar_paused'), [
      { weight_kg: 45, reps: 3 },
      { weight_kg: 45, reps: 3 },
    ]) &&
    sameWork(workSetsOf(session, 'bench_regular'), [
      { weight_kg: 45, reps: 4 },
      { weight_kg: 45, reps: 4 },
      { weight_kg: 45, reps: 4 },
    ]) &&
    sameWork(workSetsOf(session, 'ab_rollout'), [
      { weight_kg: 0, reps: 8 },
      { weight_kg: 0, reps: 8 },
      { weight_kg: 0, reps: 8 },
    ])
  );
}

export function nov23FixPending(
  history: readonly { date?: string; notes?: string; lifts?: SessionDraft['lifts'] }[],
): boolean {
  return !history.some((row) => nov23SessionIsComplete(row as SessionDraft));
}

function withKneeNote(existing: string | undefined): string {
  const text = (existing ?? '').trim();
  if (/knee sleeves/i.test(text)) return text;
  return text ? `${text} ${KNEE_NOTE}` : KNEE_NOTE;
}

/**
 * Build the gym day from whatever was stored. Sets 1–2 keep a logged RPE.
 * Set 3 is 8.5 with the belt. Weight and reps are the reported session.
 */
export function mergeNov23Session(
  saved: SessionDraft | null,
  draft: SessionDraft | null,
  extras: readonly SessionDraft[] = [],
): SessionDraft {
  const sources = [saved, draft, ...extras].filter((row): row is SessionDraft => Boolean(row));
  const squat = sources.map((row) => squatWorkSets(row)).sort((a, b) => {
    const ar = a.filter((set) => storedRpe(set) != null).length;
    const br = b.filter((set) => storedRpe(set) != null).length;
    return br - ar || b.length - a.length;
  })[0] ?? [];
  const sessionId = sources.find((row) => row.session_id && row.session_id !== NOV23_SESSION_ID)?.session_id
    ?? sources[0]?.session_id
    ?? NOV23_SESSION_ID;
  const next = nov23DayASession(sessionId, [storedRpe(squat[0]), storedRpe(squat[1])]);
  const noteParts = [...new Set(sources.map((row) => row.notes?.trim() ?? '').filter((note) => note && note !== KNEE_NOTE))];
  next.notes = withKneeNote(noteParts.join(' '));
  const readiness = sources.find((row) => row.readiness)?.readiness;
  if (readiness) next.readiness = readiness;
  next.updated_at = new Date().toISOString();
  return next;
}

function markerStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function nov23RepairMarkerValue(): string | null {
  try {
    return markerStorage()?.getItem(NOV23_REPAIR_MARKER) ?? null;
  } catch {
    return null;
  }
}

function setRepairMarker(): void {
  try {
    markerStorage()?.setItem(NOV23_REPAIR_MARKER, new Date().toISOString());
  } catch {
    /* A full private-mode store must not block the repaired log. */
  }
}

function rememberSeen(rows: readonly SessionDraft[], draft: SessionDraft | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const existing = rememberedSeen();
    if (
      existing &&
      typeof existing === 'object' &&
      'sessions' in existing &&
      Array.isArray(existing.sessions) &&
      existing.sessions.length > 0
    ) {
      return;
    }
    sessionStorage.setItem(
      NOV23_SEEN_KEY,
      JSON.stringify({ at: new Date().toISOString(), sessions: rows, draft }),
    );
  } catch {
    /* Diagnostics are best-effort. */
  }
}

function rememberedSeen(): unknown {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(NOV23_SEEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadLog(repo: SessionRepository): Promise<{ rows: SessionDraft[]; draft: SessionDraft | null }> {
  let rows = await repo.listAllComplete();
  let draft = (await repo.getDraft()) ?? null;
  if (rows.length === 0 && !draft) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    rows = await repo.listAllComplete();
    draft = (await repo.getDraft()) ?? null;
  }
  return { rows, draft };
}

function candidatesOf(
  rows: readonly SessionDraft[],
  draft: SessionDraft | null,
  include: SessionDraft | null,
): SessionDraft[] {
  const found = new Map<string, SessionDraft>();
  for (const row of rows) {
    if (isNov23StoredSession(row)) found.set(row.session_id, row);
  }
  if (draft && isNov23StoredSession(draft)) found.set(draft.session_id, draft);
  if (include) found.set(include.session_id, include);
  return [...found.values()];
}

async function logIsVerified(repo: SessionRepository): Promise<boolean> {
  const { rows, draft } = await loadLog(repo);
  const matches = rows.filter(isNov23StoredSession);
  const only = matches[0];
  if (matches.length !== 1 || !only || only.date !== NOV23_DATE || only.template_day !== 'A') return false;
  if (!nov23SessionIsComplete(only)) return false;
  if (draft && isNov23StoredSession(draft)) return false;
  return true;
}

export type Nov23RepairResult = 'repaired' | 'already' | 'unverified';

/**
 * Find every Helsinki 23 Nov 2026 session, whatever the template label, and
 * write one gym day. The marker is set only after a read-back matches.
 */
export async function repairNov23Session(
  repo: SessionRepository,
  options: { include?: SessionDraft | null } = {},
): Promise<Nov23RepairResult> {
  const { rows, draft } = await loadLog(repo);
  const include = options.include ?? null;
  const nov23 = candidatesOf(rows, draft, include).filter(
    (row) => isNov23StoredSession(row) || row.session_id === include?.session_id,
  );
  rememberSeen(
    nov23,
    draft && (isNov23StoredSession(draft) || draft.session_id === include?.session_id) ? draft : null,
  );

  if (!include && (await logIsVerified(repo))) {
    setRepairMarker();
    return 'already';
  }

  const saved = nov23.find((row) => row.status !== 'draft') ?? nov23[0] ?? null;
  const draftMatch = draft && nov23.some((row) => row.session_id === draft.session_id) ? draft : null;
  const merged = mergeNov23Session(saved, draftMatch, nov23);
  await repo.save(merged);
  const written = await repo.get(merged.session_id);
  if (!written || !nov23SessionIsComplete(written)) return 'unverified';

  for (const extra of rows) {
    if (isNov23StoredSession(extra) && extra.session_id !== merged.session_id) {
      await repo.delete(extra.session_id);
    }
  }
  if (draftMatch) await repo.clearDraft();
  if (!(await logIsVerified(repo))) return 'unverified';
  setRepairMarker();
  return 'repaired';
}

export async function seedNov23Session(
  repo: SessionRepository,
  options: { include?: SessionDraft | null } = {},
): Promise<Nov23RepairResult> {
  return repairNov23Session(repo, options);
}

/** Raw stored 23 Nov rows, plus the snapshot taken before the last repair. */
export async function nov23DiagnosticsJson(repo: SessionRepository, open?: SessionDraft | null): Promise<string> {
  const { rows, draft } = await loadLog(repo);
  const sessions = rows.filter(isNov23StoredSession);
  const draftMatch = draft && isNov23StoredSession(draft) ? draft : null;
  return JSON.stringify(
    {
      marker: nov23RepairMarkerValue(),
      sessions,
      draft: draftMatch,
      open: open ?? null,
      seenBeforeRepair: rememberedSeen(),
    },
    null,
    2,
  );
}
