import type { ExerciseId } from '../../types/exercises';
import type { SessionLog } from '../../types/session';
import type { VbtLiftKind } from './reps';
import type { LoadVelocityPoint } from './velocity';

export const VBT_LIFT_ID: Record<VbtLiftKind, ExerciseId> = {
  squat: 'squat_low_bar',
  bench: 'bench_regular',
  deadlift: 'deadlift_conventional',
};

export const VBT_LIFT_LABEL: Record<VbtLiftKind, string> = {
  squat: 'Squat',
  bench: 'Bench',
  deadlift: 'Deadlift',
};

export interface SameLoadSpeed {
  date: string;
  session_id: string;
  /** Fastest rep’s mean concentric speed at this load. */
  best_mean_m_s: number;
  /** First rep’s mean concentric speed at this load. */
  first_mean_m_s: number;
}

const LOAD_MATCH_KG = 0.6;

export function loadVelocityPoints(sessions: readonly SessionLog[], kind: VbtLiftKind): LoadVelocityPoint[] {
  const id = VBT_LIFT_ID[kind];
  const points: LoadVelocityPoint[] = [];
  for (const session of sessions) {
    for (const lift of session.lifts) {
      if (lift.exercise_id !== id) continue;
      for (const set of lift.vbt?.sets ?? []) {
        const load = set.load_kg ?? lift.sets[set.set_index]?.weight_kg ?? 0;
        if (!(load > 0) || !((set.best_velocity_m_s ?? 0) > 0)) continue;
        points.push({ load_kg: load, mean_velocity_m_s: set.best_velocity_m_s ?? 0 });
      }
    }
  }
  return points;
}

export function loadsForLift(sessions: readonly SessionLog[], kind: VbtLiftKind): number[] {
  const seen = new Set<number>();
  for (const point of loadVelocityPoints(sessions, kind)) {
    seen.add(Math.round(point.load_kg * 2) / 2);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Best-rep and first-rep mean speed at one load, oldest first. */
export function sameLoadSpeeds(
  sessions: readonly SessionLog[],
  kind: VbtLiftKind,
  loadKg: number,
): SameLoadSpeed[] {
  const id = VBT_LIFT_ID[kind];
  const rows: SameLoadSpeed[] = [];
  for (const session of sessions) {
    const date = session.date.slice(0, 10);
    for (const lift of session.lifts) {
      if (lift.exercise_id !== id) continue;
      for (const set of lift.vbt?.sets ?? []) {
        const load = set.load_kg ?? lift.sets[set.set_index]?.weight_kg ?? 0;
        if (Math.abs(load - loadKg) > LOAD_MATCH_KG) continue;
        const best = set.best_velocity_m_s ?? 0;
        const first = set.reps[0]?.mean_velocity_m_s ?? best;
        if (!(best > 0)) continue;
        rows.push({
          date,
          session_id: session.session_id,
          best_mean_m_s: best,
          first_mean_m_s: first,
        });
      }
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.session_id.localeCompare(b.session_id));
}
