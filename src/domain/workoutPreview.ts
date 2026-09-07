import { exerciseName, type SeedSet, type TemplateSlot } from '../data/templates';
import { isTimedHold, type ExerciseId } from '../types/exercises';
import { formatClock } from './countdown';
import { isWarmupSet, setDisplayLabel, workSets } from './sets';
import { attachWarmups, warmupKindFor } from './warmupLadder';

export interface PlannedSetLine {
  setNumber: number;
  label: string;
  weight_kg: number;
  reps: number;
  rpe: number;
  amrap: boolean;
  rest_sec: number;
  warmup: boolean;
}

export interface PlannedLiftSummary {
  slot_id: string;
  role: TemplateSlot['role'];
  name: string;
  alternatives: string[];
  optional: boolean;
  scheme: string;
  warmupLabel: string | null;
  restLabel: string | null;
  timed: boolean;
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

/** Compact work-set scheme, e.g. `4 × 5+` or `3 × 8, 2 × 6`. Warmups omitted. */
export function formatSetScheme(sets: SeedSet[], timed = false): string {
  const work = workSets(sets);
  if (work.length === 0) return '';
  const unit = timed ? 's' : '';
  const reps = work.map((s) => s.reps);
  const allSameReps = reps.every((r) => r === reps[0]);
  const anyAmrap = work.some((s) => s.amrap);
  if (allSameReps) {
    return `${work.length} × ${reps[0]}${unit}${anyAmrap ? '+' : ''}`;
  }

  const groups: { reps: number; count: number; amrap: boolean }[] = [];
  for (const set of work) {
    const amrap = Boolean(set.amrap);
    const last = groups[groups.length - 1];
    if (last && last.reps === set.reps && last.amrap === amrap) {
      last.count += 1;
    } else {
      groups.push({ reps: set.reps, count: 1, amrap });
    }
  }
  return groups
    .map((g) => `${g.count} × ${g.reps}${unit}${g.amrap ? '+' : ''}`)
    .join(', ');
}

export function formatRestLabel(restSec: number): string {
  return `${formatClock(restSec)} rest`;
}

export function uniformRestSeconds(sets: SeedSet[]): number | null {
  const work = workSets(sets);
  if (work.length === 0) return null;
  const first = work[0].rest_sec;
  if (work.some((s) => s.rest_sec !== first)) return null;
  return first;
}

export function formatWarmupLabel(sets: SeedSet[]): string | null {
  const warm = sets.filter(isWarmupSet);
  if (warm.length === 0) return null;
  const kg = warm.map((s) => formatLoad(s.weight_kg));
  return `W ${kg.join(' → ')}`;
}

export function plannedLiftSummary(slot: TemplateSlot): PlannedLiftSummary {
  const sets = attachWarmups(slot.sets, warmupKindFor(slot.exercise_id));
  const restSec = uniformRestSeconds(sets);
  const timed = isTimedHold(slot.exercise_id);
  return {
    slot_id: slot.slot_id,
    role: slot.role,
    name: exerciseName(slot.exercise_id),
    alternatives: uniqueAltNames(slot.exercise_id, slot.alternatives),
    optional: Boolean(slot.optional),
    scheme: formatSetScheme(sets, timed),
    warmupLabel: formatWarmupLabel(sets),
    restLabel: restSec != null ? formatRestLabel(restSec) : null,
    timed,
    sets: sets.map((set, index) => ({
      setNumber: index + 1,
      label: setDisplayLabel(sets, index),
      weight_kg: set.weight_kg,
      reps: set.reps,
      rpe: set.rpe,
      amrap: Boolean(set.amrap),
      rest_sec: set.rest_sec,
      warmup: isWarmupSet(set),
    })),
  };
}
