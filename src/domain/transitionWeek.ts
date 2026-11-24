import type { DayTemplate, SeedSet, TemplateSlot } from '../data/templates';
import type { CanonicalTemplateDay } from '../types/session';
import { LOADS_FROM_KRAFT } from './uiLang';
import { isWarmupSet } from './sets';

/**
 * Lighter week after the 20 Nov test. Only these dates. Later weeks stay
 * on their own tables. A number is the work-set load. null leaves kg blank.
 * Tue 24 Nov replaces the Day B slots. Thu and Fri still blank the usual slots.
 */
export const TRANSITION_WEEK_LOADS: Record<'B' | 'C' | 'D', Record<string, number | null>> = {
  B: {
    'b-bench': 47.5,
    'b-paused-bench': 40,
    'b-pin-press': 40,
    'b-db-row': null,
    'b-db-press': null,
    'b-side-plank': null,
  },
  C: {},
  D: {},
};

const TRANSITION_DAY: Record<string, 'B' | 'C' | 'D'> = {
  '2026-11-24': 'B',
  '2026-11-26': 'C',
  '2026-11-27': 'D',
};

const T1_REST = 180;
const ACC_REST = 90;
const CORE_REST = 60;

export function isTransitionLoadDay(asOf: string, day: CanonicalTemplateDay): boolean {
  return TRANSITION_DAY[asOf.slice(0, 10)] === day;
}

/** Tue 24 gets Kraft's check-in. Thu and Fri stay blank until the next check-in. */
export function blankTransitionTemplate(template: DayTemplate): DayTemplate {
  if (template.id === 'B') return tuesdayTransitionTemplate(template);
  const loads = TRANSITION_WEEK_LOADS[template.id as 'C' | 'D'] ?? {};
  return {
    ...template,
    focus: LOADS_FROM_KRAFT,
    slots: template.slots.map((slot) => blankSlot(slot, loads[slot.slot_id])),
  };
}

function tuesdayTransitionTemplate(template: DayTemplate): DayTemplate {
  const loads = TRANSITION_WEEK_LOADS.B;
  return {
    ...template,
    title: 'Bench day',
    focus: 'Transition week',
    slots: [
      loadedSlot({
        slot_id: 'b-bench',
        role: 'T1',
        exercise_id: 'bench_regular',
        displayName: 'Bench press',
        weight_kg: loads['b-bench'] ?? 47.5,
        reps: 4,
        sets: 3,
        rest_sec: T1_REST,
      }),
      loadedSlot({
        slot_id: 'b-paused-bench',
        role: 'accessory',
        exercise_id: 'bench_paused',
        displayName: 'Paused bench (2 s pause)',
        note: '2 s pause.',
        weight_kg: loads['b-paused-bench'] ?? 40,
        reps: 3,
        sets: 3,
        rest_sec: T1_REST,
        volumeKind: 'paused',
        counts_toward_tm: false,
      }),
      loadedSlot({
        slot_id: 'b-pin-press',
        role: 'accessory',
        exercise_id: 'bench_pin',
        displayName: 'Pin press',
        weight_kg: loads['b-pin-press'] ?? 40,
        reps: 3,
        sets: 3,
        rest_sec: T1_REST,
        counts_toward_tm: false,
      }),
      openSlot({
        slot_id: 'b-db-row',
        role: 'accessory',
        exercise_id: 'row_db_single',
        displayName: 'One-arm DB row',
        plan_label: '3 × 10 each side @ 7 RPE',
        note: 'Each side. Enter the dumbbell.',
        reps: 10,
        sets: 3,
        rest_sec: ACC_REST,
        rpe: 7,
      }),
      openSlot({
        slot_id: 'b-db-press',
        role: 'accessory',
        exercise_id: 'press_db_seated_single',
        displayName: 'One-arm DB press',
        plan_label: '3 × 10 each side, light',
        note: 'Each side. Light.',
        reps: 10,
        sets: 3,
        rest_sec: ACC_REST,
      }),
      openSlot({
        slot_id: 'b-side-plank',
        role: 'core',
        exercise_id: 'side_plank',
        displayName: 'Side plank',
        plan_label: '2–3 sets each side',
        note: 'Each side. Bodyweight.',
        reps: 0,
        sets: 3,
        rest_sec: CORE_REST,
      }),
    ],
  };
}

function loadedSlot(options: {
  slot_id: string;
  role: TemplateSlot['role'];
  exercise_id: TemplateSlot['exercise_id'];
  displayName: string;
  weight_kg: number;
  reps: number;
  sets: number;
  rest_sec: number;
  note?: string;
  volumeKind?: TemplateSlot['volumeKind'];
  counts_toward_tm?: false;
}): TemplateSlot {
  return {
    slot_id: options.slot_id,
    role: options.role,
    exercise_id: options.exercise_id,
    alternatives: [],
    displayName: options.displayName,
    skipWarmup: true,
    ...(options.note ? { note: options.note } : {}),
    ...(options.volumeKind ? { volumeKind: options.volumeKind } : {}),
    ...(options.counts_toward_tm === false ? { counts_toward_tm: false as const } : {}),
    sets: repeat(options.sets, {
      weight_kg: options.weight_kg,
      reps: options.reps,
      rpe: 6,
      rpe_label: '',
      rest_sec: options.rest_sec,
    }),
  };
}

function openSlot(options: {
  slot_id: string;
  role: TemplateSlot['role'];
  exercise_id: TemplateSlot['exercise_id'];
  displayName: string;
  plan_label: string;
  note: string;
  reps: number;
  sets: number;
  rest_sec: number;
  rpe?: number;
}): TemplateSlot {
  return {
    slot_id: options.slot_id,
    role: options.role,
    exercise_id: options.exercise_id,
    alternatives: [],
    displayName: options.displayName,
    plan_label: options.plan_label,
    note: options.note,
    skipWarmup: true,
    counts_toward_tm: false,
    sets: repeat(options.sets, {
      weight_kg: 0,
      reps: options.reps,
      rpe: options.rpe ?? 6,
      ...(options.rpe == null ? { rpe_label: '' } : {}),
      open_load: true,
      rest_sec: options.rest_sec,
    }),
  };
}

function repeat(count: number, set: SeedSet): SeedSet[] {
  return Array.from({ length: count }, () => ({ ...set }));
}

function blankSlot(slot: TemplateSlot, known: number | null | undefined): TemplateSlot {
  const work = slot.sets.filter((set) => !isWarmupSet(set));
  const sets: SeedSet[] = (work.length > 0 ? work : slot.sets).map((set) => {
    if (known != null && known > 0) {
      return { ...set, weight_kg: known, open_load: false };
    }
    return { ...set, weight_kg: 0, open_load: true };
  });
  return {
    ...slot,
    skipWarmup: true,
    plan_label: known != null && known > 0 ? undefined : LOADS_FROM_KRAFT,
    sets,
  };
}
