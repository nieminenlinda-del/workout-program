import {
  DAY_TEMPLATES,
  exerciseName,
  type DayTemplate,
  type SeedSet,
  type TemplateSlot,
} from '../data/templates';
import type { ExerciseId } from '../types/exercises';
import type { CanonicalTemplateDay, SessionLog, TemplateDay } from '../types/session';
import {
  BLOCK_B_TRAINING_MAXES,
  SEED_TRAINING_MAXES,
  TEST_DAY,
  type MesocycleBlock,
  type TrainingMaxes,
} from '../types/phase2';
import { ACCESSORY_SEED_LOADS } from './accessoryProgression';
import { calendarYmd, isLoggedWorkSet, topWorkSet } from './lastPerformance';
import { addCalendarDays, testWeekRole } from './testWeek';

export { addCalendarDays, mondayOnOrBefore, testWeekRole } from './testWeek';
export type { TestWeekRole } from './testWeek';

/** One slice of a T1: a uniform block, or a top single / backoff. */
export interface T1Wave {
  weight_kg: number;
  set_count: number;
  reps: number;
  rpe?: number[];
  rpe_label?: string;
  /** `Top` or `Backoff`. */
  part?: string;
  /** Display weight when the attempt is a range. */
  weight_label?: string;
}

/** Kraft-locked T1 work prescription for one template day. */
export interface T1Prescription {
  weight_kg: number;
  set_count: number;
  reps: number;
  /** Per-set RPE; length matches `set_count` when `waves` is absent. */
  rpe: number[];
  /**
   * Target shown wherever the app prints a planned RPE, when that target is a
   * band rather than one number per set (deload weeks: `5–6`).
   */
  rpe_label?: string;
  /** Coaching line under the T1 name. */
  note?: string;
  /** Top + backoff. `weight_kg` stays the top-set load for the hold check. */
  waves?: T1Wave[];
  plan_label?: string;
}

/**
 * Block B auto-progression hold. A top set logged above this RPE repeats the
 * previous week's load instead of the planned step up. 8.5 does not hold.
 */
export const HOLD_RPE_ABOVE = 8.5;

/** Working-set target when the coach locked loads but not an RPE. Deloads stay 5–6. */
const WORK_RPE = 8;
const BACKOFF_RPE = 7;

const DELOAD_NOTE = 'Deload. RPE 5–6.';

export function isPlannedDeload(block: MesocycleBlock, weekIndex: number): boolean {
  return (block === 'A' || block === 'B') && weekIndex === 4;
}

/** C2 drops every non-T1 slot. C1 keeps accessories at two sets. No separate T2/T3 tag. */
export function dropAccessorySlots(block: MesocycleBlock, weekIndex: number): boolean {
  return block === 'C' && weekIndex === 2;
}

export function trainingMaxesForBlock(block: MesocycleBlock | null): TrainingMaxes {
  if (block === 'B' || block === 'C') return BLOCK_B_TRAINING_MAXES;
  return SEED_TRAINING_MAXES;
}

export function isStepUp(planned: T1Prescription, previous: T1Prescription): boolean {
  if (planned.weight_kg < previous.weight_kg) return false;
  return prescriptionKey(planned) !== prescriptionKey(previous);
}

export function shouldApplyHold(input: {
  frozen: boolean;
  block: MesocycleBlock | null;
  steppingUp: boolean;
  topRpe: number | null;
}): boolean {
  if (input.frozen || input.block !== 'B' || !input.steppingUp) return false;
  return input.topRpe != null && input.topRpe > HOLD_RPE_ABOVE;
}

export function holdNote(rpe: number): string {
  const shown = Number.isInteger(rpe) ? String(rpe) : String(rpe);
  return `Held: last top set RPE ${shown}`;
}

export function blockPrescription(
  block: MesocycleBlock,
  weekIndex: number,
  day: CanonicalTemplateDay,
): T1Prescription | null {
  if (block === 'B') return BLOCK_B_T1[weekIndex as BlockWeek]?.[day] ?? null;
  if (block === 'C') return BLOCK_C_T1[weekIndex as BlockWeek]?.[day] ?? null;
  return null;
}

/** Full session for a test-week training day or the test day. Null on ordinary dates. */
export function templateOverrideForDate(ymd: string, testDate: string = TEST_DAY): DayTemplate | null {
  const role = testWeekRole(ymd, testDate);
  if (role === 'opener') return openerTemplate();
  if (role === 'pull') return pullTemplate();
  if (role === 'test') return testAttemptTemplate();
  return null;
}

export function expandPrescription(rx: T1Prescription, restSec: number): SeedSet[] {
  const waves = rx.waves?.length
    ? rx.waves
    : [
        {
          weight_kg: rx.weight_kg,
          set_count: rx.set_count,
          reps: rx.reps,
          rpe: rx.rpe,
          rpe_label: rx.rpe_label,
        },
      ];
  const sets: SeedSet[] = [];
  for (const wave of waves) {
    for (let i = 0; i < wave.set_count; i += 1) {
      sets.push({
        weight_kg: wave.weight_kg,
        reps: wave.reps,
        rpe: wave.rpe?.[i] ?? wave.rpe?.[wave.rpe.length - 1] ?? rx.rpe[i] ?? rx.rpe[rx.rpe.length - 1] ?? WORK_RPE,
        rest_sec: restSec,
        ...(wave.rpe_label ? { rpe_label: wave.rpe_label } : {}),
        ...(wave.part ? { part_label: partLabel(wave, i) } : {}),
        ...(wave.weight_label ? { weight_label: wave.weight_label } : {}),
      });
    }
  }
  return sets;
}

/** Previous product week, using the day before this week starts. */
export function previousWeekAnchor(asOf: string, weekStart: string): string | null {
  const prev = addCalendarDays(weekStart, -1);
  if (prev >= asOf.slice(0, 10)) return null;
  return prev;
}

export function topSetRpeInWeek(
  logs: readonly SessionLog[],
  day: CanonicalTemplateDay,
  start: string,
  end: string,
): number | null {
  const rows = logs
    .filter((log) => {
      const date = calendarYmd(log.date);
      return (
        Boolean(date) &&
        date >= start &&
        date <= end &&
        sameTemplateDay(log.template_day, day)
      );
    })
    .sort((a, b) => (calendarYmd(b.date) ?? '').localeCompare(calendarYmd(a.date) ?? ''));
  const latest = rows[0];
  const top = latest ? topWorkSet(latest.lifts[0]?.sets ?? []) : null;
  return top ? top.rpe : null;
}

type BlockWeek = 1 | 2 | 3 | 4;

const BLOCK_B_T1: Partial<Record<BlockWeek, Record<CanonicalTemplateDay, T1Prescription>>> = {
  1: {
    A: uniform(60, 3, 4),
    B: uniform(42.5, 3, 5),
    C: uniform(77.5, 3, 3),
    D: uniform(42.5, 3, 5),
  },
  2: {
    A: uniform(62.5, 3, 3),
    B: uniform(45, 3, 3),
    C: uniform(80, 3, 2),
    D: uniform(42.5, 3, 4),
  },
  3: {
    A: uniform(65, 3, 2),
    B: uniform(47.5, 3, 2),
    C: uniform(82.5, 3, 2),
    D: uniform(42.5, 3, 3),
  },
  4: {
    A: deload(47.5, 2, 4),
    B: deload(32.5, 2, 5),
    C: deload(57.5, 2, 3),
    D: deload(32.5, 2, 5),
  },
};

const BLOCK_C_T1: Partial<Record<BlockWeek, Record<CanonicalTemplateDay, T1Prescription>>> = {
  1: {
    A: topBackoff(67.5, 1, 60, 2, 2, 'Capped.'),
    B: topBackoff(47.5, 1, 42.5, 2, 2, 'Capped.'),
    C: topBackoff(87.5, 1, 77.5, 2, 2, 'Capped.'),
    D: { ...uniform(40, 2, 3), note: 'Capped.' },
  },
  2: {
    A: topBackoff(70, 1, 60, 2, 2, 'Frozen.'),
    B: topBackoff(50, 1, 42.5, 2, 2, 'Frozen.'),
    C: topBackoff(90, 1, 77.5, 1, 2, 'Deadlift early in the week. Frozen.'),
    D: { ...uniform(40, 2, 2), note: 'Frozen.' },
  },
};

const BACKOFF_RPE_VALUE = BACKOFF_RPE;
const PAUSED_RPE_LABEL = '6–7';

/** [weight, sets, reps] after the top sets. Absent on deload, C2, and Day D. */
const VOLUME_BACKOFF: Partial<
  Record<MesocycleBlock, Partial<Record<BlockWeek, Partial<Record<CanonicalTemplateDay, [number, number, number]>>>>>
> = {
  B: {
    1: { A: [55, 3, 5], B: [37.5, 3, 6], C: [67.5, 2, 5] },
    2: { A: [55, 3, 5], B: [37.5, 3, 6], C: [67.5, 2, 5] },
    3: { A: [55, 2, 5], B: [37.5, 2, 6], C: [67.5, 2, 5] },
  },
  C: {
    1: { A: [55, 1, 5], B: [37.5, 1, 5], C: [67.5, 1, 5] },
  },
};

/** Day C paused bench [sets, reps]. B1–B3 are 3×6; C1 is 2×5. */
const PAUSED_BENCH: Partial<Record<MesocycleBlock, Partial<Record<BlockWeek, [number, number]>>>> = {
  B: { 1: [3, 6], 2: [3, 6], 3: [3, 6] },
  C: { 1: [2, 5] },
};

/**
 * Extra rows for this week: back-off sets, and on Day C a paused bench.
 * These are not part of the T1 prescription, so a hold repeats the top sets
 * and leaves these loads on the table for the current week.
 */
export function volumeSlotsFor(
  block: MesocycleBlock,
  weekIndex: number,
  day: CanonicalTemplateDay,
): TemplateSlot[] {
  const slots: TemplateSlot[] = [];
  const backoff = VOLUME_BACKOFF[block]?.[weekIndex as BlockWeek]?.[day];
  if (backoff) slots.push(backoffSlot(day, backoffExercise(day), backoff[0], backoff[1], backoff[2]));
  if (day === 'C') {
    const paused = PAUSED_BENCH[block]?.[weekIndex as BlockWeek];
    if (paused) slots.push(pausedBenchSlot(paused[0], paused[1]));
  }
  return slots;
}

/**
 * B1–B3 accessories gain one set (seed 3 → 4, optionals 2 → 3) at RPE 7.
 * B4 and C1 keep the first two seed sets and their seed RPEs.
 * Other weeks return the slot unchanged. Kilograms and reps stay on the seed.
 */
export function accessorySlotForWeek(
  slot: TemplateSlot,
  block: MesocycleBlock,
  weekIndex: number,
): TemplateSlot {
  if (slot.role === 'T1') return slot;
  if (block === 'B' && weekIndex >= 1 && weekIndex <= 3) {
    return resizeAccessory(slot, Math.min(4, slot.sets.length + 1), BACKOFF_RPE_VALUE);
  }
  if ((block === 'B' && weekIndex === 4) || (block === 'C' && weekIndex === 1)) {
    return resizeAccessory(slot, Math.min(2, slot.sets.length), null);
  }
  return slot;
}

function backoffExercise(day: CanonicalTemplateDay): ExerciseId {
  if (day === 'A') return 'squat_low_bar';
  if (day === 'B') return 'bench_regular';
  return 'deadlift_conventional';
}

function backoffSlot(
  day: CanonicalTemplateDay,
  exerciseId: ExerciseId,
  weight_kg: number,
  set_count: number,
  reps: number,
): TemplateSlot {
  return {
    slot_id: `${day.toLowerCase()}-backoff`,
    role: 'T1',
    exercise_id: exerciseId,
    alternatives: [],
    displayName: `${exerciseName(exerciseId)} · back-off`,
    note: 'Back-off.',
    volumeKind: 'backoff',
    skipWarmup: true,
    sets: Array.from({ length: set_count }, (_, index) => ({
      weight_kg,
      reps,
      rpe: BACKOFF_RPE_VALUE,
      rest_sec: 180,
      part_label: set_count === 1 ? 'Backoff' : `B${index + 1}`,
    })),
  };
}

function pausedBenchSlot(set_count: number, reps: number): TemplateSlot {
  return {
    slot_id: 'c-paused-bench',
    role: 'T1',
    exercise_id: 'bench_regular',
    alternatives: [],
    displayName: 'Bench press · paused',
    note: 'Paused. RPE 6–7.',
    volumeKind: 'paused',
    sets: Array.from({ length: set_count }, (_, index) => ({
      weight_kg: 35,
      reps,
      rpe: index === set_count - 1 ? 7 : 6,
      rpe_label: PAUSED_RPE_LABEL,
      rest_sec: 180,
    })),
  };
}

/** B1–B3 only. B4, Block C, and the test week keep the seed accessories. */
export function blockBVariationWeek(block: MesocycleBlock, weekIndex: number): boolean {
  return block === 'B' && weekIndex >= 1 && weekIndex <= 3;
}

export const PAUSED_DEADLIFT_SLOT = 'a-paused-dl';
export const CLOSE_GRIP_SLOT = 'd-close-grip';
export const MOVED_RDL_SLOT = 'd-hinge';
export const SINGLE_ARM_BENCH_SLOT = 'b-db-press';
export const SINGLE_ARM_ROW_SLOT = 'd-db-row';
export const VARIATION_STEP_KG = 2.5;
export const PAUSED_DL_BASE_KG = 60;

const PAUSED_DL_NOTE = '2 s pause just below the knee. RPE 6–7.';
const ACCESSORY_REST_SEC = 90;

/**
 * Day A swaps the RDL for a paused conventional deadlift.
 * Day D receives that week's Day A RDL prescription and swaps cable rope
 * pushdown for close-grip bench. The front-squat slot gains the existing
 * paused low-bar alternative. Loads here are the B1 bases; Today applies
 * the log rule on top.
 */
export function withBlockBVariations(
  slots: TemplateSlot[],
  day: CanonicalTemplateDay,
  block: MesocycleBlock,
  weekIndex: number,
): TemplateSlot[] {
  if (day === 'A') {
    return slots.map((slot) => (slot.slot_id === 'a-hinge' ? pausedDeadliftSlot() : slot));
  }
  if (day !== 'D') return slots;
  const moved = movedRdlSlot(block, weekIndex);
  const next = slots.map((slot) => {
    if (slot.slot_id === 'd-tri') return closeGripSlot();
    if (slot.slot_id === 'd-squat' && !slot.alternatives.includes('squat_low_bar_paused')) {
      const alternatives: ExerciseId[] = [...slot.alternatives, 'squat_low_bar_paused'];
      return { ...slot, alternatives };
    }
    return slot;
  });
  const index = next.findIndex((slot) => slot.role === 'T1' && !slot.volumeKind);
  if (!moved) return next;
  if (index < 0) return [moved, ...next];
  return [...next.slice(0, index + 1), moved, ...next.slice(index + 1)];
}

export interface VariationLog {
  /** Completed work sets, session order. Empty when that week has no log. */
  rpes: number[];
  /** Last completed work set, or null when nothing was logged. */
  lastRpe: number | null;
}

/**
 * Latest session that week for this template day. Matches `slot_id` first,
 * then `exercise_id`. Warmups and sets marked incomplete stay out.
 */
export function variationLogInWeek(
  logs: readonly SessionLog[],
  day: CanonicalTemplateDay,
  exerciseId: ExerciseId,
  slotId: string,
  start: string,
  end: string,
): VariationLog {
  const lift = latestSlotLift(logs, day, exerciseId, slotId, start, end);
  const rpes = (lift?.sets ?? []).filter((set) => isLoggedWorkSet(set)).map((set) => set.rpe);
  return { rpes, lastRpe: rpes.length > 0 ? rpes[rpes.length - 1] : null };
}

/** Completed work sets from the latest session that week, for accessory double progression. */
export function accessorySetsInWeek(
  logs: readonly SessionLog[],
  day: CanonicalTemplateDay,
  exerciseId: ExerciseId,
  slotId: string,
  start: string,
  end: string,
): { reps: number; rpe: number }[] {
  const lift = latestSlotLift(logs, day, exerciseId, slotId, start, end);
  return (lift?.sets ?? []).filter((set) => isLoggedWorkSet(set)).map((set) => ({ reps: set.reps, rpe: set.rpe }));
}

function latestSlotLift(
  logs: readonly SessionLog[],
  day: CanonicalTemplateDay,
  exerciseId: ExerciseId,
  slotId: string,
  start: string,
  end: string,
) {
  const rows = logs
    .filter((log) => {
      const date = calendarYmd(log.date);
      return Boolean(date) && date >= start && date <= end && sameTemplateDay(log.template_day, day);
    })
    .sort((a, b) => (calendarYmd(b.date) ?? '').localeCompare(calendarYmd(a.date) ?? ''));
  return rows[0]?.lifts.find((row) => row.slot_id === slotId || row.exercise_id === exerciseId);
}

/** Every completed work set is RPE 7 or lower. The log stores each set's RPE. */
export function pausedDeadliftSteps(log: VariationLog): boolean {
  return log.rpes.length > 0 && log.rpes.every((rpe) => rpe <= 7);
}

export function variationStepNote(rpe: number): string {
  return `+2.5 kg: last RPE ${shownRpe(rpe)}`;
}

export function variationHeldNote(rpe: number, last = true): string {
  const label = last ? 'last RPE' : 'RPE';
  return `Held: ${label} ${shownRpe(rpe)}`;
}

/** RPE the Today note should cite for this week's step or hold. */
export function variationCitedRpe(log: VariationLog): number | null {
  if (log.rpes.length === 0) return null;
  return pausedDeadliftSteps(log) ? log.lastRpe : Math.max(...log.rpes);
}

function shownRpe(rpe: number): string {
  return Number.isInteger(rpe) ? String(rpe) : String(rpe);
}

function pausedDeadliftSlot(): TemplateSlot {
  const setCount = 3;
  return {
    slot_id: PAUSED_DEADLIFT_SLOT,
    role: 'accessory',
    exercise_id: 'deadlift_paused',
    alternatives: [],
    displayName: 'Paused conventional deadlift',
    note: PAUSED_DL_NOTE,
    skipWarmup: true,
    sets: Array.from({ length: setCount }, (_, index) => ({
      weight_kg: PAUSED_DL_BASE_KG,
      reps: 3,
      rpe: index === setCount - 1 ? 7 : 6,
      rpe_label: '6–7',
      rest_sec: ACCESSORY_REST_SEC,
    })),
  };
}

/**
 * B2 (week of 12 Oct) and B3 only. Right arm lags on bench under fatigue.
 * B1, the B4 deload, and every other block keep the seed accessories.
 * The app has no per-arm field, so each round is one loggable set and the
 * scheme plus the cue carry "per arm, right side first".
 * Coach locked reps and RPE, not the dumbbell. 8 kg is the lightest
 * programmed DB (the curl seed) so the logger has a starting plate.
 */
const SINGLE_ARM_DB_KG = 8;
const SINGLE_ARM_CUE = 'Start with the right side, match reps on the left.';

export function unilateralSlotsFor(
  block: MesocycleBlock,
  weekIndex: number,
  day: CanonicalTemplateDay,
): TemplateSlot[] {
  if (block !== 'B' || (weekIndex !== 2 && weekIndex !== 3)) return [];
  if (day === 'B') return [singleArmSlot(SINGLE_ARM_BENCH_SLOT, 'bench_db_single')];
  if (day === 'D') return [singleArmSlot(SINGLE_ARM_ROW_SLOT, 'row_db_single')];
  return [];
}

function singleArmSlot(slotId: string, exerciseId: ExerciseId): TemplateSlot {
  return {
    slot_id: slotId,
    role: 'accessory',
    exercise_id: exerciseId,
    alternatives: [],
    note: SINGLE_ARM_CUE,
    plan_label: `${SINGLE_ARM_DB_KG} kg · 3 × 10 / arm`,
    skipWarmup: true,
    sets: Array.from({ length: 3 }, () => ({
      weight_kg: SINGLE_ARM_DB_KG,
      reps: 10,
      rpe: BACKOFF_RPE_VALUE,
      rest_sec: ACCESSORY_REST_SEC,
    })),
  };
}

function closeGripSlot(): TemplateSlot {
  return {
    slot_id: CLOSE_GRIP_SLOT,
    role: 'accessory',
    exercise_id: 'bench_close_grip',
    alternatives: [],
    displayName: 'Close-grip bench press',
    skipWarmup: true,
    sets: Array.from({ length: 3 }, () => ({
      weight_kg: ACCESSORY_SEED_LOADS['d-close-grip'].weight_kg,
      reps: ACCESSORY_SEED_LOADS['d-close-grip'].reps,
      rpe: 7,
      rest_sec: ACCESSORY_REST_SEC,
    })),
  };
}

/** The Day A RDL after this week's accessory rule, parked on Day D. */
function movedRdlSlot(block: MesocycleBlock, weekIndex: number): TemplateSlot | null {
  const hinge = DAY_TEMPLATES.A.slots.find((slot) => slot.slot_id === 'a-hinge');
  if (!hinge) return null;
  return { ...accessorySlotForWeek(hinge, block, weekIndex), slot_id: MOVED_RDL_SLOT };
}

function resizeAccessory(slot: TemplateSlot, count: number, rpe: number | null): TemplateSlot {
  const sets = Array.from({ length: count }, (_, index) => {
    const src = slot.sets[Math.min(index, slot.sets.length - 1)];
    if (rpe == null) return { ...src };
    const next: SeedSet = { ...src, rpe };
    delete next.rpe_label;
    return next;
  });
  return { ...slot, sets };
}

function uniform(weight_kg: number, set_count: number, reps: number): T1Prescription {
  return {
    weight_kg,
    set_count,
    reps,
    rpe: Array.from({ length: set_count }, () => WORK_RPE),
  };
}

function deload(weight_kg: number, set_count: number, reps: number): T1Prescription {
  return {
    weight_kg,
    set_count,
    reps,
    rpe: [5, 6],
    rpe_label: '5–6',
    note: DELOAD_NOTE,
  };
}

function topBackoff(
  topKg: number,
  topReps: number,
  backKg: number,
  backSets: number,
  backReps: number,
  note: string,
): T1Prescription {
  const waves: T1Wave[] = [
    { weight_kg: topKg, set_count: 1, reps: topReps, rpe: [WORK_RPE], part: 'Top' },
    {
      weight_kg: backKg,
      set_count: backSets,
      reps: backReps,
      rpe: Array.from({ length: backSets }, () => BACKOFF_RPE),
      part: 'Backoff',
    },
  ];
  return {
    weight_kg: topKg,
    set_count: 1 + backSets,
    reps: topReps,
    rpe: [WORK_RPE, ...Array.from({ length: backSets }, () => BACKOFF_RPE)],
    note,
    waves,
  };
}

function partLabel(wave: T1Wave, index: number): string {
  if (!wave.part) return '';
  if (wave.part === 'Backoff') return wave.set_count === 1 ? 'Backoff' : `B${index + 1}`;
  if (wave.set_count === 1) return wave.part;
  return `${wave.part} ${index + 1}`;
}

function openerTemplate(): DayTemplate {
  return pairedTemplate('A', 'Mon', 'Squat + bench', 'Test week opener. Frozen.', [
    lift('tw-squat', 'squat_low_bar', uniformSets(52.5, 2, 2)),
    lift('tw-bench', 'bench_regular', uniformSets(37.5, 2, 2)),
  ]);
}

function pullTemplate(): DayTemplate {
  return pairedTemplate('C', 'Wed', 'Deadlift + bench', 'Test week pull. Frozen.', [
    lift('tw-dl', 'deadlift_conventional', uniformSets(65, 2, 2)),
    lift('tw-bench-2', 'bench_regular', uniformSets(40, 2, 1)),
  ]);
}

export const PLANNED_ATTEMPT_LABELS = {
  squat: '70 / 75 / 77.5–80',
  bench: '50 / 52.5 / 55–57.5',
  deadlift: '87.5 / 92.5–95 / 97.5–100',
} as const;

function testAttemptTemplate(): DayTemplate {
  return pairedTemplate('A', 'Mon', '1RM test', 'Planned attempts. Squat, then bench, then deadlift.', [
    attemptLift('test-squat', 'squat_low_bar', PLANNED_ATTEMPT_LABELS.squat, [
      { weight_kg: 70 },
      { weight_kg: 75 },
      { weight_kg: 77.5, weight_label: '77.5–80' },
    ]),
    attemptLift('test-bench', 'bench_regular', PLANNED_ATTEMPT_LABELS.bench, [
      { weight_kg: 50 },
      { weight_kg: 52.5 },
      { weight_kg: 55, weight_label: '55–57.5' },
    ]),
    attemptLift('test-dl', 'deadlift_conventional', PLANNED_ATTEMPT_LABELS.deadlift, [
      { weight_kg: 87.5 },
      { weight_kg: 92.5, weight_label: '92.5–95' },
      { weight_kg: 97.5, weight_label: '97.5–100' },
    ]),
  ]);
}

function pairedTemplate(
  id: CanonicalTemplateDay,
  weekday: DayTemplate['weekday'],
  title: string,
  focus: string,
  slots: TemplateSlot[],
): DayTemplate {
  return { id, weekday, title, focus, slots };
}

function lift(slotId: string, exerciseId: ExerciseId, sets: SeedSet[]): TemplateSlot {
  return {
    slot_id: slotId,
    role: 'T1',
    exercise_id: exerciseId,
    alternatives: [],
    note: 'Frozen.',
    sets,
  };
}

function attemptLift(
  slotId: string,
  exerciseId: ExerciseId,
  attempts: string,
  rows: { weight_kg: number; weight_label?: string }[],
): TemplateSlot {
  return {
    slot_id: slotId,
    role: 'T1',
    exercise_id: exerciseId,
    alternatives: [],
    note: 'Planned attempts.',
    plan_label: `Planned · ${attempts} kg`,
    sets: rows.map((row) => ({
      weight_kg: row.weight_kg,
      reps: 1,
      rpe: WORK_RPE,
      rest_sec: 180,
      ...(row.weight_label ? { weight_label: row.weight_label } : {}),
    })),
  };
}

function uniformSets(weight_kg: number, set_count: number, reps: number): SeedSet[] {
  return Array.from({ length: set_count }, () => ({
    weight_kg,
    reps,
    rpe: WORK_RPE,
    rest_sec: 180,
  }));
}

function prescriptionKey(rx: T1Prescription): string {
  if (rx.waves?.length) {
    return rx.waves.map((wave) => `${wave.weight_kg}x${wave.set_count}x${wave.reps}`).join('|');
  }
  return `${rx.weight_kg}x${rx.set_count}x${rx.reps}`;
}

function sameTemplateDay(day: TemplateDay, expected: CanonicalTemplateDay): boolean {
  if (day === expected) return true;
  if (expected === 'A') return day === 'Mon';
  if (expected === 'B') return day === 'Tue';
  if (expected === 'C') return day === 'Thu';
  return day === 'Fri';
}
