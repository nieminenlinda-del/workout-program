import {
  EQUIPMENT_LABELS,
  EXERCISE_CATALOG,
  exerciseEquipment,
  isAssistedLoad,
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
import { DAY_TEMPLATES } from '../data/templates';
import { formatLoad } from './formatLoad';
import { slotExerciseIds } from './equipment';
import { isWarmupSet } from './sets';
import { canonicalTemplateDay } from './templateDay';

/**
 * Last matching gym performance for a movement.
 *
 * **Top work set rule:** among completed sets of the matching lift, pick the
 * highest `weight_kg`; ties go to highest `reps`; still tied → last such set
 * in session order. Assisted vertical pulls invert kg (lowest assistance is
 * hardest). Sets flagged `warmup` are ignored (empty-bar ladders must not
 * become “last week”). Bodyweight work is `0 kg` / BW and still counts.
 *
 * **Session match:** most recent log with calendar date **before** `asOf`.
 * There is no ISO-week / mesocycle / “same week only” filter — Week 1 Friday
 * (2026-09-11) is a prior log for a Week 2 Monday draft (2026-09-14) and for
 * a Sunday preview (`asOf` 2026-09-13). Prefer the same canonical template
 * day (A–D); if that day has never been logged, fall back to any day.
 *
 * **Lift match:** exact `exercise_id` first, then other IDs in the same
 * template slot (default + `alternatives`). That is how a Day D cable
 * pushdown still sees last Friday’s `tricep_pushdown_band` (or BW) log.
 * Historical SessionLog rows are not rewritten.
 */
export interface LastPerformance {
  exercise_id: ExerciseId;
  template_day: CanonicalTemplateDay;
  date: string;
  weight_kg: number;
  reps: number;
  equipment?: Equipment;
}

/** Default + alternatives for the slot that contains this id on the given day. */
export function slotFamilyIds(exerciseId: ExerciseId, templateDay: TemplateDay): ExerciseId[] {
  const day = canonicalTemplateDay(templateDay);
  const slot = DAY_TEMPLATES[day].slots.find((row) => slotExerciseIds(row).includes(exerciseId));
  return slot ? slotExerciseIds(slot) : [exerciseId];
}

/** True for logged work. Explicit `completed: false` stays out; missing counts (legacy). */
export function isLoggedWorkSet(set: LoggedSet): boolean {
  return !isWarmupSet(set) && set.completed !== false;
}

export function topWorkSet(sets: readonly LoggedSet[], assisted = false): LoggedSet | null {
  let best: LoggedSet | null = null;
  for (const set of sets) {
    if (!isLoggedWorkSet(set)) continue;
    if (!best) {
      best = set;
      continue;
    }
    if (assisted) {
      if (set.weight_kg < best.weight_kg) {
        best = set;
        continue;
      }
    } else if (set.weight_kg > best.weight_kg) {
      best = set;
      continue;
    }
    if (set.weight_kg === best.weight_kg && set.reps >= best.reps) {
      best = set;
    }
  }
  return best;
}

/**
 * Leading calendar day, or empty when the value is not a date.
 * Accepts `YYYY-MM-DD`, unpadded `YYYY-M-D`, and a trailing timestamp
 * (`2026-09-07T18:00:00.000Z`). Do not Date.parse ISO dates — UTC midnight
 * becomes the previous local day west of UTC.
 */
export function calendarYmd(value: string | undefined | null): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function liftForExercise(
  lifts: readonly LoggedLift[],
  exerciseId: ExerciseId,
  family: readonly ExerciseId[],
): LoggedLift | undefined {
  const exact = lifts.find((lift) => lift.exercise_id === exerciseId);
  if (exact) return exact;
  return lifts.find((lift) => family.includes(lift.exercise_id));
}

function sessionDateBefore(session: SessionLog, asOf: string): boolean {
  const sessionDay = calendarYmd(session.date);
  const asOfDay = calendarYmd(asOf);
  if (!sessionDay) return false;
  // Unparseable asOf must not hide every prior log (Week 1 would vanish).
  if (!asOfDay) return true;
  return sessionDay < asOfDay;
}

function fromSession(
  session: SessionLog,
  exerciseId: ExerciseId,
  family: readonly ExerciseId[],
): LastPerformance | null {
  const lift = liftForExercise(session.lifts, exerciseId, family);
  if (!lift) return null;
  const top = topWorkSet(lift.sets, isAssistedLoad(lift.exercise_id));
  if (!top) return null;
  return {
    exercise_id: lift.exercise_id,
    template_day: canonicalTemplateDay(session.template_day),
    date: calendarYmd(session.date) || session.date.slice(0, 10),
    weight_kg: top.weight_kg,
    reps: top.reps,
    equipment: lift.equipment ?? exerciseEquipment(lift.exercise_id),
  };
}

export function lastMatchingPerformance(
  logs: readonly SessionLog[],
  exerciseId: ExerciseId,
  templateDay: TemplateDay,
  asOf: string,
): LastPerformance | null {
  const day = canonicalTemplateDay(templateDay);
  const family = slotFamilyIds(exerciseId, day);
  const prior = logs.filter((row) => sessionDateBefore(row, asOf));
  // Newest first so the first hit is the previous occurrence (last week, not last year).
  const newestFirst = [...prior].sort((a, b) => b.date.localeCompare(a.date));

  for (const session of newestFirst) {
    if (canonicalTemplateDay(session.template_day) !== day) continue;
    const match = fromSession(session, exerciseId, family);
    if (match) return match;
  }

  for (const session of newestFirst) {
    const match = fromSession(session, exerciseId, family);
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

/** `Last: 50 kg × 5` or muted-copy `No prior log`. Accessory adds · DBs / Bands / Cable / Barbell. */
export function formatLastPerformance(perf: LastPerformance | null): string {
  if (!perf) return 'No prior log';
  const count = isTimedHold(perf.exercise_id) ? `${perf.reps}s` : String(perf.reps);
  const load = `Last: ${formatLoad(perf.weight_kg, isAssistedLoad(perf.exercise_id))} × ${count}`;
  if (!perf.equipment || perf.equipment === 'bodyweight') return load;
  if (EXERCISE_CATALOG[perf.exercise_id]?.role === 'primary') return load;
  return `${load} · ${EQUIPMENT_LABELS[perf.equipment]}`;
}
