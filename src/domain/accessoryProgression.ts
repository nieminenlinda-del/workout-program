import type { TemplateSlot } from '../data/templates';
import {
  exerciseEquipment,
  isAssistedLoad,
  isTimedHold,
  type ExerciseId,
} from '../types/exercises';

/**
 * Block B and Block C accessory starting loads.
 * Edit this table when Kraft sends the B1 numbers (before Mon 5 Oct).
 * Block A stays on the inline sets in `src/data/templates.ts`.
 * B4 and C1 copy this table and stop there (2 sets, no double progression).
 * B1–B3 Today walks logs on top of these seeds.
 */
export const ACCESSORY_SEED_LOADS: Record<string, { weight_kg: number; reps: number }> = {
  'a-hinge': { weight_kg: 50, reps: 8 },
  'd-hinge': { weight_kg: 50, reps: 8 },
  'a-leg': { weight_kg: 37.5, reps: 8 },
  'a-core': { weight_kg: 0, reps: 60 },
  'b-row': { weight_kg: 40, reps: 8 },
  'b-press': { weight_kg: 25, reps: 6 },
  'b-upper': { weight_kg: 0, reps: 15 },
  'c-glute': { weight_kg: 82.5, reps: 12 },
  'c-hinge': { weight_kg: 40, reps: 8 },
  'c-core': { weight_kg: 0, reps: 20 },
  'd-squat': { weight_kg: 30, reps: 8 },
  'd-pull': { weight_kg: 0, reps: 6 },
  'd-curl': { weight_kg: 8, reps: 12 },
  'd-tri': { weight_kg: 12.5, reps: 12 },
  'd-close-grip': { weight_kg: 40, reps: 8 },
};

export interface RepRange {
  min: number;
  max: number;
  unit: 'reps' | 'seconds';
}

const REP_RANGE: RepRange = { min: 8, max: 12, unit: 'reps' };
const CLOSE_GRIP_RANGE: RepRange = { min: 6, max: 10, unit: 'reps' };
const HOLD_RANGE: RepRange = { min: 30, max: 60, unit: 'seconds' };

/** Close-grip is 6–10. Holds are 30–60 s. Everything else is 8–12. */
export function accessoryRange(exerciseId: ExerciseId): RepRange {
  if (isTimedHold(exerciseId)) return HOLD_RANGE;
  if (exerciseId === 'bench_close_grip') return CLOSE_GRIP_RANGE;
  return REP_RANGE;
}

export type AccessoryJump =
  | { kind: 'kg'; kg: number }
  | { kind: 'reps'; reps: number }
  | { kind: 'seconds'; seconds: number };

/**
 * Smallest successful jump.
 * No dumbbell-pair list exists, so dumbbells step +2 kg per dumbbell.
 * Cable steps one plate (2.5 kg). Assisted cable steps the same plate off the help.
 */
export function accessoryJump(exerciseId: ExerciseId): AccessoryJump {
  if (isTimedHold(exerciseId)) return { kind: 'seconds', seconds: 5 };
  const equipment = exerciseEquipment(exerciseId);
  if (equipment === 'dumbbells') return { kind: 'kg', kg: 2 };
  if (equipment === 'cable' || equipment === 'barbell') return { kind: 'kg', kg: 2.5 };
  return { kind: 'reps', reps: 1 };
}

export interface AccessoryState {
  weightKg: number;
  reps: number;
  missStreak: number;
}

export interface AccessorySetLog {
  reps: number;
  rpe: number;
}

const RESET_NOTE = 'Reset −7.5%: 2 sessions missed';

export function isDoubleProgressionSlot(slot: TemplateSlot): boolean {
  return slot.role !== 'T1' && !slot.volumeKind && slot.exercise_id !== 'deadlift_paused';
}

/** Copy the seed table onto the slot. B1–B3 clamp the target into the rep range. */
export function paintAccessorySeed(slot: TemplateSlot, clampReps: boolean): TemplateSlot {
  if (!isDoubleProgressionSlot(slot)) return slot;
  const seed = ACCESSORY_SEED_LOADS[slot.slot_id];
  if (!seed) return slot;
  const range = accessoryRange(slot.exercise_id);
  const reps = clampReps ? clamp(seed.reps, range.min, range.max) : seed.reps;
  return {
    ...slot,
    sets: slot.sets.map((set) => ({ ...set, weight_kg: seed.weight_kg, reps })),
  };
}

/**
 * One previous session at a time, oldest first.
 * An empty session keeps the running load and does not count as a miss.
 * Loaded jumps add weight and reset reps to the bottom of the range.
 * Bodyweight and holds have no external load, so the jump is the rep or the
 * seconds themselves and is not then reset (a reset would cancel the jump).
 */
export function stepAccessory(
  state: AccessoryState,
  sets: readonly AccessorySetLog[],
  exerciseId: ExerciseId,
): { state: AccessoryState; note?: string } {
  if (sets.length === 0) return { state, note: undefined };
  const range = accessoryRange(exerciseId);
  const decision = classifySets(sets, range);
  if (decision === 'jump') return jumpState(state, sets, exerciseId, range);
  if (decision === 'plus') {
    return {
      state: { ...state, reps: Math.min(range.max, state.reps + 1), missStreak: 0 },
      note: range.unit === 'seconds' ? '+1 s target' : '+1 rep target',
    };
  }
  if (decision === 'hold-top') {
    return {
      state: { ...state, missStreak: 0 },
      note: `Held: RPE ${shownRpe(maxRpe(sets))}`,
    };
  }
  const missStreak = state.missStreak + 1;
  if (missStreak >= 2) return dropState(state, exerciseId, range);
  const note = decision === 'miss-low' ? 'Held: set below range' : `Held: RPE ${shownRpe(maxRpe(sets))}`;
  return { state: { ...state, missStreak }, note };
}

/** Previous sessions, oldest first. B1 (no history) returns the slot unchanged. */
export function progressAccessorySlot(
  slot: TemplateSlot,
  previousSessions: readonly (readonly AccessorySetLog[])[],
): TemplateSlot {
  if (!isDoubleProgressionSlot(slot) || previousSessions.length === 0) return slot;
  const range = accessoryRange(slot.exercise_id);
  let state: AccessoryState = {
    weightKg: slot.sets[0]?.weight_kg ?? 0,
    reps: slot.sets[0]?.reps ?? range.min,
    missStreak: 0,
  };
  let note: string | undefined;
  for (const sets of previousSessions) {
    const next = stepAccessory(state, sets, slot.exercise_id);
    state = next.state;
    note = sets.length > 0 ? next.note : undefined;
  }
  return {
    ...slot,
    sets: slot.sets.map((set) => ({ ...set, weight_kg: state.weightKg, reps: state.reps })),
    note: note ?? slot.note,
  };
}

/**
 * In-session, non-blocking. A logged work set under RPE 6 suggests the
 * smallest jump for the sets still to log. RPE 6 does not.
 */
export function inSessionJumpHint(
  exerciseId: ExerciseId,
  weightKg: number,
  reps: number,
  completedRpes: readonly number[],
  remainingWorkSets: number,
): string | null {
  if (remainingWorkSets <= 0) return null;
  if (!completedRpes.some((rpe) => rpe < 6)) return null;
  const jump = accessoryJump(exerciseId);
  if (jump.kind === 'kg') {
    const assisted = isAssistedLoad(exerciseId);
    const next = roundKg(assisted ? weightKg - jump.kg : weightKg + jump.kg);
    return `Under RPE 6. Try ${Math.max(0, next)} kg on the remaining sets.`;
  }
  if (jump.kind === 'seconds') {
    return `Under RPE 6. Try ${reps + jump.seconds}s on the remaining sets.`;
  }
  return `Under RPE 6. Try ${reps + jump.reps} reps on the remaining sets.`;
}

/** 7.5% of the load, rounded to the nearest jump, and at least one jump. */
export function droppedWeight(weightKg: number, jumpKg: number, assisted = false): number {
  if (!(weightKg > 0) || !(jumpKg > 0)) return weightKg;
  const steps = Math.max(1, Math.round((weightKg * 0.075) / jumpKg));
  const delta = roundKg(steps * jumpKg);
  return roundKg(Math.max(0, assisted ? weightKg + delta : weightKg - delta));
}

function classifySets(sets: readonly AccessorySetLog[], range: RepRange): 'jump' | 'plus' | 'hold-top' | 'miss-low' | 'miss-rpe' {
  if (sets.some((set) => set.reps < range.min)) return 'miss-low';
  if (sets.some((set) => set.rpe >= 9)) return 'miss-rpe';
  const atTop = sets.every((set) => set.reps >= range.max);
  if (!atTop) return 'plus';
  if (sets.every((set) => set.rpe <= 7)) return 'jump';
  return 'hold-top';
}

function jumpState(
  state: AccessoryState,
  sets: readonly AccessorySetLog[],
  exerciseId: ExerciseId,
  range: RepRange,
): { state: AccessoryState; note: string } {
  const jump = accessoryJump(exerciseId);
  const detail = `all sets ${minReps(sets)} @ RPE ${shownRpe(maxRpe(sets))}`;
  if (jump.kind === 'seconds') {
    return {
      state: { ...state, reps: Math.max(state.reps, minReps(sets)) + jump.seconds, missStreak: 0 },
      note: `+${jump.seconds} s: ${detail}`,
    };
  }
  if (jump.kind === 'reps') {
    return {
      state: { ...state, reps: Math.max(state.reps, minReps(sets)) + jump.reps, missStreak: 0 },
      note: `+${jump.reps} rep: ${detail}`,
    };
  }
  const assisted = isAssistedLoad(exerciseId);
  const nextWeight = Math.max(0, roundKg(assisted ? state.weightKg - jump.kg : state.weightKg + jump.kg));
  const delta = roundKg(Math.abs(nextWeight - state.weightKg));
  const sign = nextWeight < state.weightKg ? '−' : '+';
  return {
    state: { weightKg: nextWeight, reps: range.min, missStreak: 0 },
    note: `${sign}${delta} kg: ${detail}`,
  };
}

function dropState(
  state: AccessoryState,
  exerciseId: ExerciseId,
  range: RepRange,
): { state: AccessoryState; note: string } {
  const jump = accessoryJump(exerciseId);
  const assisted = isAssistedLoad(exerciseId);
  const weightKg = jump.kind === 'kg' ? droppedWeight(state.weightKg, jump.kg, assisted) : state.weightKg;
  return {
    state: { weightKg, reps: range.min, missStreak: 0 },
    note: RESET_NOTE,
  };
}

function minReps(sets: readonly AccessorySetLog[]): number {
  return Math.min(...sets.map((set) => set.reps));
}

function maxRpe(sets: readonly AccessorySetLog[]): number {
  return Math.max(...sets.map((set) => set.rpe));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundKg(kg: number): number {
  return Math.round(kg * 10) / 10;
}

function shownRpe(rpe: number): string {
  return Number.isInteger(rpe) ? String(rpe) : String(rpe);
}
