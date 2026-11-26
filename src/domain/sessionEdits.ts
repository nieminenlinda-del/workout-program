import type { LoggedLift, LoggedSet, SessionDraft, VbtLiftLog, VbtSetLog } from '../types/session';
import { workSets } from './sets';

export interface ManualExerciseInput {
  name: string;
  setCount?: number;
  reps?: number;
  weightKg?: number;
  bodyweight?: boolean;
  eachSide?: boolean;
}

const NAME_MAX = 48;

export function restSecondsForSet(
  planned: readonly { rest_sec: number }[] | undefined,
  setIndex: number,
): number {
  const row = planned?.[setIndex] ?? planned?.[planned.length - 1];
  return row?.rest_sec ?? 90;
}

export function canRemoveSet(lift: LoggedLift | undefined): boolean {
  if (!lift || lift.sets.length <= 1) return false;
  return lift.sets.some((set) => !set.completed);
}

/** Copy the last work set’s load and reps. The new row is unlogged and unnumbered. */
export function addWorkSet(draft: SessionDraft, liftIndex: number): SessionDraft {
  const lift = draft.lifts[liftIndex];
  if (!lift) return draft;
  const sets = [...lift.sets, blankWorkSet(templateSet(lift))];
  return replaceLift(draft, liftIndex, { ...lift, sets });
}

/**
 * Drop the last set she has not logged. Logged sets stay. An exercise always
 * keeps one set.
 */
export function removeLastUnloggedSet(draft: SessionDraft, liftIndex: number): SessionDraft {
  const lift = draft.lifts[liftIndex];
  if (!canRemoveSet(lift)) return draft;
  let index = -1;
  for (let cursor = lift.sets.length - 1; cursor >= 0; cursor -= 1) {
    if (!lift.sets[cursor]?.completed) {
      index = cursor;
      break;
    }
  }
  if (index < 0) return draft;
  const sets = lift.sets.filter((_, cursor) => cursor !== index);
  return replaceLift(draft, liftIndex, {
    ...lift,
    sets,
    vbt: reindexVbt(lift.vbt, index),
  });
}

export function addManualExercise(draft: SessionDraft, input: ManualExerciseInput): SessionDraft {
  const name = cleanName(input.name);
  if (!name) return draft;
  const bodyweight = input.bodyweight === true || !(input.weightKg && input.weightKg > 0);
  const weight = bodyweight ? 0 : clamp(input.weightKg ?? 0);
  const reps = clampInt(input.reps ?? 10, 1, 50);
  const count = clampInt(input.setCount ?? 3, 1, 8);
  const set = blankWorkSet(undefined, weight, reps);
  if (bodyweight) set.open_load = false;
  const lift: LoggedLift = {
    name,
    exercise_id: 'custom',
    equipment: bodyweight ? 'bodyweight' : 'dumbbells',
    slot_id: `custom-${draft.lifts.length + 1}`,
    manual: true,
    counts_toward_tm: false,
    ...(input.eachSide ? { each_side: true } : {}),
    sets: Array.from({ length: count }, () => ({ ...set })),
  };
  return {
    ...draft,
    lifts: [...draft.lifts, lift],
    updated_at: new Date().toISOString(),
  };
}

/** Take a mistaken extra exercise off this session. Logged work stays. */
export function removeManualExercise(draft: SessionDraft, liftIndex: number): SessionDraft {
  const lift = draft.lifts[liftIndex];
  if (!lift?.manual) return draft;
  if (lift.sets.some((set) => set.completed)) return draft;
  return {
    ...draft,
    lifts: draft.lifts.filter((_, index) => index !== liftIndex),
    updated_at: new Date().toISOString(),
  };
}

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

function clamp(kg: number): number {
  if (!Number.isFinite(kg)) return 0;
  return Math.min(500, Math.max(0, Math.round(kg * 4) / 4));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function templateSet(lift: LoggedLift): LoggedSet | undefined {
  const work = workSets(lift.sets);
  return work[work.length - 1] ?? lift.sets[lift.sets.length - 1];
}

function blankWorkSet(source: LoggedSet | undefined, weight?: number, reps?: number): LoggedSet {
  const kg = weight ?? source?.target_weight_kg ?? source?.weight_kg ?? 0;
  const targetReps = reps ?? source?.target_reps ?? source?.reps ?? 8;
  return {
    weight_kg: kg,
    reps: targetReps,
    completed: false,
    amrap: Boolean(source?.amrap),
    target_weight_kg: kg,
    target_reps: targetReps,
    ...(source?.rpe_label ? { rpe_label: source.rpe_label } : {}),
    ...(source?.weight_label ? { weight_label: source.weight_label } : {}),
    ...(source?.open_load ? { open_load: true } : {}),
  };
}

function reindexVbt(vbt: VbtLiftLog | undefined, removedIndex: number): VbtLiftLog | undefined {
  if (!vbt) return undefined;
  const sets = vbt.sets
    .filter((set) => set.set_index !== removedIndex)
    .map((set) => (set.set_index > removedIndex ? shiftVbt(set) : set));
  if (sets.length === 0) return undefined;
  return { ...vbt, sets };
}

function shiftVbt(set: VbtSetLog): VbtSetLog {
  return { ...set, set_index: set.set_index - 1 };
}

function replaceLift(draft: SessionDraft, liftIndex: number, lift: LoggedLift): SessionDraft {
  return {
    ...draft,
    lifts: draft.lifts.map((row, index) => (index === liftIndex ? lift : row)),
    updated_at: new Date().toISOString(),
  };
}
