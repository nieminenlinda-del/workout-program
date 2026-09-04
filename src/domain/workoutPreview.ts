import { exerciseName, type SeedSet, type TemplateSlot } from '../data/templates';
import type { ExerciseId } from '../types/exercises';
import { formatClock } from './countdown';

export interface PlannedSetLine {
  setNumber: number;
  weight_kg: number;
  reps: number;
  rpe: number;
  amrap: boolean;
  rest_sec: number;
}

export interface PlannedLiftSummary {
  slot_id: string;
  role: TemplateSlot['role'];
  name: string;
  alternatives: string[];
  optional: boolean;
  scheme: string;
  restLabel: string | null;
  sets: PlannedSetLine[];
}

/** Alternative names that differ from the programmed lift (read-only preview). */
export function uniqueAltNames(primary: ExerciseId, alternatives: ExerciseId[]): string[] {
  const primaryName = exerciseName(primary);
  return [...new Set(alternatives.map(exerciseName).filter((name) => name !== primaryName))];
}

export function formatLoad(weightKg: number): string {
  return weightKg > 0 ? `${weightKg} kg` : 'BW';
}

/** Compact sets × reps, e.g. `4 × 5+` or `3 × 8, 2 × 6`. */
export function formatSetScheme(sets: SeedSet[]): string {
  if (sets.length === 0) return '';
  const reps = sets.map((s) => s.reps);
  const allSameReps = reps.every((r) => r === reps[0]);
  const anyAmrap = sets.some((s) => s.amrap);
  if (allSameReps) {
    return `${sets.length} × ${reps[0]}${anyAmrap ? '+' : ''}`;
  }

  const groups: { reps: number; count: number; amrap: boolean }[] = [];
  for (const set of sets) {
    const amrap = Boolean(set.amrap);
    const last = groups[groups.length - 1];
    if (last && last.reps === set.reps && last.amrap === amrap) {
      last.count += 1;
    } else {
      groups.push({ reps: set.reps, count: 1, amrap });
    }
  }
  return groups
    .map((g) => `${g.count} × ${g.reps}${g.amrap ? '+' : ''}`)
    .join(', ');
}

export function formatRestLabel(restSec: number): string {
  return `${formatClock(restSec)} rest`;
}

export function uniformRestSeconds(sets: SeedSet[]): number | null {
  if (sets.length === 0) return null;
  const first = sets[0].rest_sec;
  if (sets.some((s) => s.rest_sec !== first)) return null;
  return first;
}

export function plannedLiftSummary(slot: TemplateSlot): PlannedLiftSummary {
  const restSec = uniformRestSeconds(slot.sets);
  return {
    slot_id: slot.slot_id,
    role: slot.role,
    name: exerciseName(slot.exercise_id),
    alternatives: uniqueAltNames(slot.exercise_id, slot.alternatives),
    optional: Boolean(slot.optional),
    scheme: formatSetScheme(slot.sets),
    restLabel: restSec != null ? formatRestLabel(restSec) : null,
    sets: slot.sets.map((set, index) => ({
      setNumber: index + 1,
      weight_kg: set.weight_kg,
      reps: set.reps,
      rpe: set.rpe,
      amrap: Boolean(set.amrap),
      rest_sec: set.rest_sec,
    })),
  };
}
