import type { LoggedSet } from '../types/session';
import { formatLoad } from './workoutPreview';

type WeightReps = {
  weight_kg: number;
  reps: number;
  target_weight_kg?: number;
  target_reps?: number;
};

/** Snapshot programmed kg/reps onto the set if they are not already stored. */
export function withPrescription<T extends WeightReps>(set: T): T {
  return {
    ...set,
    target_weight_kg: set.target_weight_kg ?? set.weight_kg,
    target_reps: set.target_reps ?? set.reps,
  };
}

export function prescriptionWeightKg(set: Pick<WeightReps, 'weight_kg' | 'target_weight_kg'>): number {
  return set.target_weight_kg ?? set.weight_kg;
}

export function prescriptionReps(set: Pick<WeightReps, 'reps' | 'target_reps'>): number {
  return set.target_reps ?? set.reps;
}

export function formatLoadReps(weightKg: number, reps: number, amrap?: boolean): string {
  return `${formatLoad(weightKg)} × ${reps}${amrap ? '+' : ''}`;
}

/** Visible plan for an unfinished row (or the original plan on a logged row). */
export function formatPlanLoad(set: WeightReps & { amrap?: boolean }): string {
  return formatLoadReps(prescriptionWeightKg(set), prescriptionReps(set), set.amrap);
}

export function formatLoggedLoad(set: Pick<LoggedSet, 'weight_kg' | 'reps' | 'amrap'>): string {
  return formatLoadReps(set.weight_kg, set.reps, set.amrap);
}

export function loggedDiffersFromPlan(set: LoggedSet): boolean {
  if (!set.completed) return false;
  return prescriptionWeightKg(set) !== set.weight_kg || prescriptionReps(set) !== set.reps;
}
