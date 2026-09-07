import {
  EQUIPMENT_LABELS,
  EXERCISE_CATALOG,
  exerciseEquipment,
  isTimedHold,
  type Equipment,
  type ExerciseId,
} from '../types/exercises';
import type {
  CanonicalTemplateDay,
  LoggedLift,
  LoggedSet,
  SessionLog,
  TemplateDay,
} from '../types/session';
import { formatLoad } from './workoutPreview';
import { isWarmupSet } from './sets';
import { canonicalTemplateDay } from './templateDay';

/**
 * Last matching gym performance for a movement.
 *
 * **Top work set rule:** among completed sets of the matching lift, pick the
 * highest `weight_kg`; ties go to highest `reps`; still tied → last such set
 * in session order. Sets flagged `warmup` are ignored (empty-bar ladders must
 * not become “last week”). Bodyweight work is `0 kg` / BW and still counts.
 *
 * **Session match:** most recent completed log with `date < asOf` that contains
 * the same `exercise_id`. Prefer the same canonical template day (A–D) —
 * that is the previous occurrence of this day, typically ~7 days earlier.
 * If that day has never been logged, fall back to the same exercise on any day.
 */
export interface LastPerformance {
  exercise_id: ExerciseId;
  template_day: CanonicalTemplateDay;
  date: string;
  weight_kg: number;
  reps: number;
  equipment?: Equipment;
}

export function topWorkSet(sets: readonly LoggedSet[]): LoggedSet | null {
  let best: LoggedSet | null = null;
  for (const set of sets) {
    if (!set.completed || isWarmupSet(set)) continue;
    if (!best) {
      best = set;
      continue;
    }
    if (set.weight_kg > best.weight_kg) {
      best = set;
      continue;
    }
    if (set.weight_kg === best.weight_kg && set.reps >= best.reps) {
      best = set;
    }
  }
  return best;
}

function liftForExercise(lifts: readonly LoggedLift[], exerciseId: ExerciseId): LoggedLift | undefined {
  return lifts.find((lift) => lift.exercise_id === exerciseId);
}

function sessionDateBefore(session: SessionLog, asOf: string): boolean {
  return session.date.slice(0, 10) < asOf.slice(0, 10);
}

function fromSession(
  session: SessionLog,
  exerciseId: ExerciseId,
): LastPerformance | null {
  const lift = liftForExercise(session.lifts, exerciseId);
  if (!lift) return null;
  const top = topWorkSet(lift.sets);
  if (!top) return null;
  return {
    exercise_id: exerciseId,
    template_day: canonicalTemplateDay(session.template_day),
    date: session.date.slice(0, 10),
    weight_kg: top.weight_kg,
    reps: top.reps,
    equipment: lift.equipment ?? exerciseEquipment(exerciseId),
  };
}

export function lastMatchingPerformance(
  logs: readonly SessionLog[],
  exerciseId: ExerciseId,
  templateDay: TemplateDay,
  asOf: string,
): LastPerformance | null {
  const day = canonicalTemplateDay(templateDay);
  const prior = logs.filter((row) => sessionDateBefore(row, asOf));
  // Newest first so the first hit is the previous occurrence.
  const newestFirst = [...prior].sort((a, b) => b.date.localeCompare(a.date));

  for (const session of newestFirst) {
    if (canonicalTemplateDay(session.template_day) !== day) continue;
    const match = fromSession(session, exerciseId);
    if (match) return match;
  }

  for (const session of newestFirst) {
    const match = fromSession(session, exerciseId);
    if (match) return match;
  }

  return null;
}

export function lastPerformanceByExercise(
  logs: readonly SessionLog[],
  templateDay: TemplateDay,
  asOf: string,
  exerciseIds: readonly ExerciseId[],
): Map<ExerciseId, LastPerformance | null> {
  const map = new Map<ExerciseId, LastPerformance | null>();
  for (const id of exerciseIds) {
    map.set(id, lastMatchingPerformance(logs, id, templateDay, asOf));
  }
  return map;
}

/** `Last: 50 kg × 5` or muted-copy `No prior log`. Accessory adds · DBs / Bands / Barbell. */
export function formatLastPerformance(perf: LastPerformance | null): string {
  if (!perf) return 'No prior log';
  const count = isTimedHold(perf.exercise_id) ? `${perf.reps}s` : String(perf.reps);
  const load = `Last: ${formatLoad(perf.weight_kg)} × ${count}`;
  if (!perf.equipment || perf.equipment === 'bodyweight') return load;
  if (EXERCISE_CATALOG[perf.exercise_id]?.role === 'primary') return load;
  return `${load} · ${EQUIPMENT_LABELS[perf.equipment]}`;
}
