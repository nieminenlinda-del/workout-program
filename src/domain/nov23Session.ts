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

/** Full Mon 23 Day A. Squat work sets can be replaced by ones already on the phone. */
export function nov23DayASession(sessionId = NOV23_SESSION_ID): SessionDraft {
  return {
    session_id: sessionId,
    date: NOV23_DATE,
    template_day: 'A',
    readiness: withComputedLight(DEFAULT_READINESS),
    pain_flag: false,
    pain_note: '',
    notes: 'Knee sleeves. Low-bar squat. Belt on set 3 only.',
    status: 'complete',
    updated_at: '2026-11-23T18:00:00.000Z',
    lifts: [
      lift(
        'squat_low_bar',
        [
          work(55, 5),
          work(55, 5),
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

function workSetsOf(session: SessionDraft | null | undefined, exerciseId: ExerciseId): LoggedSet[] {
  const row = session?.lifts.find((lift) => lift.exercise_id === exerciseId);
  return row?.sets.filter((set) => set.completed && !isWarmupSet(set)) ?? [];
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

/** The stored Mon 23 row already matches the full gym session. */
export function nov23SessionIsComplete(session: SessionDraft | null | undefined): boolean {
  if (!session || !isNov23DayA(session)) return false;
  if (!/knee sleeves/i.test(session.notes)) return false;
  const paused = session.lifts.find((lift) => lift.exercise_id === 'squat_low_bar_paused');
  const rollout = session.lifts.find((lift) => lift.exercise_id === 'ab_rollout');
  if (!paused || !/2\s*s/i.test(paused.name)) return false;
  if (!rollout || !/knee/i.test(rollout.name)) return false;
  return (
    sameWork(workSetsOf(session, 'squat_low_bar'), [
      { weight_kg: 55, reps: 5 },
      { weight_kg: 55, reps: 5 },
      { weight_kg: 55, reps: 5, rpe: 8.5, part_label: 'Belt' },
    ]) &&
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

/** Today keeps offering the fix until the full Mon 23 session is in the log. */
export function nov23FixPending(history: readonly { date: string; template_day: string }[]): boolean {
  return !history.some((row) => nov23SessionIsComplete(row as SessionDraft));
}

/**
 * Replace a missing or partial Mon 23 session with the full gym day.
 * Squat sets already on the phone are not kept when they disagree with the log.
 */
export function mergeNov23Session(
  saved: SessionDraft | null,
  draft: SessionDraft | null,
): SessionDraft {
  const sessionId = saved?.session_id ?? draft?.session_id ?? NOV23_SESSION_ID;
  const next = nov23DayASession(sessionId);
  if (saved?.readiness) next.readiness = saved.readiness;
  else if (draft?.readiness) next.readiness = draft.readiness;
  return next;
}

export function isNov23DayA(session: { date: string; template_day: string }): boolean {
  return calendarYmd(session.date) === NOV23_DATE && canonicalTemplateDay(session.template_day as 'A') === 'A';
}

export async function seedNov23Session(repo: SessionRepository): Promise<'added' | 'merged' | 'already'> {
  const complete = await repo.listAllComplete();
  const draft = await repo.getDraft();
  const saved = complete.find((row) => isNov23DayA(row)) ?? null;
  const draftMatch = draft && isNov23DayA(draft) ? draft : null;
  if (saved && nov23SessionIsComplete(saved)) {
    for (const extra of complete) {
      if (isNov23DayA(extra) && extra.session_id !== saved.session_id) {
        await repo.delete(extra.session_id);
      }
    }
    if (draftMatch) await repo.clearDraft();
    return 'already';
  }
  const merged = mergeNov23Session(saved, draftMatch);
  await repo.save(merged);
  for (const extra of complete) {
    if (isNov23DayA(extra) && extra.session_id !== merged.session_id) {
      await repo.delete(extra.session_id);
    }
  }
  if (draftMatch) await repo.clearDraft();
  return saved || draftMatch ? 'merged' : 'added';
}
