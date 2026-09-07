import type { ExerciseId } from '../types/exercises';
import type { SeedSet } from '../data/templates';
import type { LoggedSet } from '../types/session';
import { isWarmupSet, workSets } from './sets';

export type WarmupKind = 'squat' | 'bench' | 'deadlift';

export interface WarmupStep {
  weight_kg: number;
  reps: number;
}

const BAR_KG = 20;
const NEAREST = 2.5;
const WARM_REST = 60;
const WARM_REST_LAST = 90;

export function roundToNearest2p5(kg: number): number {
  return Math.round(kg / NEAREST) * NEAREST;
}

export function warmupKindFor(exerciseId: ExerciseId): WarmupKind | null {
  if (exerciseId === 'deadlift_conventional') return 'deadlift';
  if (exerciseId === 'bench_regular' || exerciseId === 'bench_regular_volume') return 'bench';
  if (exerciseId === 'squat_low_bar') return 'squat';
  return null;
}

/**
 * Work weight W for the ladder: most common non-AMRAP work set, else first work set.
 * Week 1 seeds: squat 55, bench 40, DL 70.
 */
export function prescribedWorkWeightKg(sets: readonly { weight_kg: number; warmup?: boolean; amrap?: boolean }[]): number {
  const work = workSets(sets);
  const counted = work.filter((s) => !s.amrap);
  const pool = counted.length > 0 ? counted : work;
  if (pool.length === 0) return 0;
  const freq = new Map<number, number>();
  let best = pool[0].weight_kg;
  let bestN = 0;
  for (const set of pool) {
    const n = (freq.get(set.weight_kg) ?? 0) + 1;
    freq.set(set.weight_kg, n);
    if (n > bestN) {
      best = set.weight_kg;
      bestN = n;
    }
  }
  return best;
}

/**
 * Kraft warmup ladder from work weight W.
 *
 * 1. Bar 20 × 5–8 (skip if W ≤ 25)
 * 2. ~50% W × 5 (nearest 2.5; DL first plate at least 40 if 20/30 is pointless)
 * 3. ~70% W × 3
 * 4. ~85% W × 1–2 (omit the single if W − this ≤ 5; the load may still be the last ×3)
 *
 * Round every load to 2.5. Skip a step within 2.5 kg of the previous kept step or of W.
 * Never warmup ≥ W. Reps drop as load rises (bar 8 if W < 40 else 5, then 5, 3, 2).
 */
export function warmupLadder(workKg: number, kind: WarmupKind = 'squat'): WarmupStep[] {
  const W = roundToNearest2p5(workKg);
  if (!(W > 0)) return [];

  const weights: number[] = [];

  if (W > 25) weights.push(BAR_KG);

  let fifty = roundToNearest2p5(W * 0.5);
  if (kind === 'deadlift' && fifty < 40) fifty = 40;
  weights.push(fifty);
  weights.push(roundToNearest2p5(W * 0.7));
  weights.push(roundToNearest2p5(W * 0.85));

  const kept: number[] = [];
  for (const raw of weights) {
    const kg = roundToNearest2p5(raw);
    if (kg <= 0 || kg >= W) continue;
    if (W - kg <= NEAREST) continue;
    const prev = kept[kept.length - 1];
    if (prev != null && kg - prev <= NEAREST) continue;
    kept.push(kg);
  }

  if (kept.length >= 4) {
    const last = kept[kept.length - 1];
    if (W - last <= 5) kept.pop();
  }

  const barReps = W < 40 ? 8 : 5;
  return kept.map((weight_kg, index) => ({
    weight_kg,
    reps: repsFor(index, kept.length, kept[0] === BAR_KG, barReps),
  }));
}

function repsFor(index: number, total: number, firstIsBar: boolean, barReps: number): number {
  if (index === 0 && firstIsBar) return barReps;
  const fromEnd = total - 1 - index;
  if (fromEnd === 0) return total >= 4 ? 2 : 3;
  if (fromEnd === 1 && total >= 3) return total >= 4 ? 3 : 5;
  return 5;
}

/**
 * Yellow / low-readiness: bar + the last intermediate, then work.
 * Not attached to sessions yet — tomorrow ships the full ladder.
 */
export function shortLadder(workKg: number, kind: WarmupKind = 'squat'): WarmupStep[] {
  const full = warmupLadder(workKg, kind);
  if (full.length <= 2) return full;
  return [full[0], full[full.length - 1]];
}

export function warmupSeedSets(workKg: number, kind: WarmupKind): SeedSet[] {
  const steps = warmupLadder(workKg, kind);
  return steps.map((step, index) => ({
    weight_kg: step.weight_kg,
    reps: step.reps,
    rpe: 5,
    warmup: true,
    rest_sec: index === steps.length - 1 ? WARM_REST_LAST : WARM_REST,
  }));
}

export function attachWarmups<T extends SeedSet | LoggedSet>(sets: T[], kind: WarmupKind | null): T[] {
  const work = workSets(sets) as T[];
  if (!kind || work.length === 0) return work;
  const existingWarm = sets.filter(isWarmupSet) as T[];
  if (existingWarm.some((s) => 'completed' in s && s.completed)) {
    return [...existingWarm, ...work];
  }
  const W = prescribedWorkWeightKg(work);
  const asLogged = work.some((s) => 'completed' in s);
  const next = warmupSeedSets(W, kind).map((step) =>
    asLogged
      ? ({
          weight_kg: step.weight_kg,
          reps: step.reps,
          rpe: 5,
          warmup: true,
          completed: false,
          target_weight_kg: step.weight_kg,
          target_reps: step.reps,
        } as T)
      : (step as T),
  );
  return [...next, ...work];
}

/** Rebuild unused warmup ladders from current work-set W (keeps logged warmups). */
export function refreshDraftWarmups<T extends { exercise_id: ExerciseId; sets: LoggedSet[] }>(
  lifts: T[],
): T[] {
  return lifts.map((lift) => ({
    ...lift,
    sets: attachWarmups(lift.sets, warmupKindFor(lift.exercise_id)),
  }));
}
