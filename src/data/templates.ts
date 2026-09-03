import { EXERCISE_CATALOG, type ExerciseId } from '../types/exercises';
import type { CanonicalTemplateDay } from '../types/session';

export interface SeedSet {
  weight_kg: number;
  reps: number;
  rpe: number;
  amrap?: boolean;
  rest_sec: number;
}

export interface TemplateSlot {
  slot_id: string;
  role: 'T1' | 'accessory' | 'core' | 'optional';
  exercise_id: ExerciseId;
  alternatives: ExerciseId[];
  optional?: boolean;
  sets: SeedSet[];
}

export interface DayTemplate {
  id: CanonicalTemplateDay;
  weekday: 'Mon' | 'Tue' | 'Thu' | 'Fri';
  title: string;
  focus: string;
  slots: TemplateSlot[];
}

const T1_REST = 180;
const ACC_REST = 90;
const CORE_REST = 60;

/** Static 4-day seed. Phase 2 will replace weights via the progression engine. */
export const DAY_TEMPLATES: Record<CanonicalTemplateDay, DayTemplate> = {
  A: {
    id: 'A',
    weekday: 'Mon',
    title: 'Squat day',
    focus: 'Low-bar squat T1',
    slots: [
      {
        slot_id: 'a-t1',
        role: 'T1',
        exercise_id: 'squat_low_bar',
        alternatives: [],
        sets: [
          { weight_kg: 45, reps: 5, rpe: 6.5, rest_sec: T1_REST },
          { weight_kg: 47.5, reps: 5, rpe: 7, rest_sec: T1_REST },
          { weight_kg: 47.5, reps: 5, rpe: 7.5, rest_sec: T1_REST },
          { weight_kg: 50, reps: 5, rpe: 8, amrap: true, rest_sec: T1_REST },
        ],
      },
      {
        slot_id: 'a-hinge',
        role: 'accessory',
        exercise_id: 'rdl',
        alternatives: ['deadlift_rdl'],
        sets: [
          { weight_kg: 50, reps: 8, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 50, reps: 8, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 50, reps: 8, rpe: 7.5, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'a-leg',
        role: 'accessory',
        exercise_id: 'reverse_lunge',
        alternatives: ['goblet_squat', 'squat_goblet'],
        sets: [
          { weight_kg: 12, reps: 8, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 12, reps: 8, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 12, reps: 8, rpe: 7.5, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'a-core',
        role: 'core',
        exercise_id: 'plank',
        alternatives: ['dead_bug'],
        sets: [
          { weight_kg: 0, reps: 30, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 0, reps: 30, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 0, reps: 30, rpe: 7, rest_sec: CORE_REST },
        ],
      },
    ],
  },
  B: {
    id: 'B',
    weekday: 'Tue',
    title: 'Bench day',
    focus: 'Bench press T1',
    slots: [
      {
        slot_id: 'b-t1',
        role: 'T1',
        exercise_id: 'bench_regular',
        alternatives: [],
        sets: [
          { weight_kg: 32.5, reps: 5, rpe: 6.5, rest_sec: T1_REST },
          { weight_kg: 35, reps: 5, rpe: 7, rest_sec: T1_REST },
          { weight_kg: 35, reps: 5, rpe: 7.5, rest_sec: T1_REST },
          { weight_kg: 37.5, reps: 5, rpe: 8, amrap: true, rest_sec: T1_REST },
        ],
      },
      {
        slot_id: 'b-row',
        role: 'accessory',
        exercise_id: 'row_barbell',
        alternatives: ['row_db'],
        sets: [
          { weight_kg: 40, reps: 8, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 40, reps: 8, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 40, reps: 8, rpe: 7.5, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'b-press',
        role: 'accessory',
        exercise_id: 'overhead_press',
        alternatives: [],
        sets: [
          { weight_kg: 25, reps: 6, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 25, reps: 6, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 25, reps: 6, rpe: 7.5, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'b-upper',
        role: 'accessory',
        exercise_id: 'band_pull_apart',
        alternatives: ['face_pull_band', 'y_raise'],
        sets: [
          { weight_kg: 0, reps: 15, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 0, reps: 15, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 0, reps: 15, rpe: 7, rest_sec: CORE_REST },
        ],
      },
    ],
  },
  C: {
    id: 'C',
    weekday: 'Thu',
    title: 'Deadlift day',
    focus: 'Conventional deadlift T1',
    slots: [
      {
        slot_id: 'c-t1',
        role: 'T1',
        exercise_id: 'deadlift_conventional',
        alternatives: [],
        sets: [
          { weight_kg: 60, reps: 4, rpe: 6.5, rest_sec: T1_REST },
          { weight_kg: 65, reps: 4, rpe: 7, rest_sec: T1_REST },
          { weight_kg: 67.5, reps: 4, rpe: 7.5, rest_sec: T1_REST },
          { weight_kg: 70, reps: 4, rpe: 8, amrap: true, rest_sec: T1_REST },
        ],
      },
      {
        slot_id: 'c-glute',
        role: 'accessory',
        exercise_id: 'glute_bridge',
        alternatives: ['hip_thrust'],
        sets: [
          { weight_kg: 40, reps: 10, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 40, reps: 10, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 40, reps: 10, rpe: 7.5, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'c-hinge',
        role: 'accessory',
        exercise_id: 'rdl',
        alternatives: ['good_morning_light'],
        sets: [
          { weight_kg: 40, reps: 8, rpe: 6.5, rest_sec: ACC_REST },
          { weight_kg: 40, reps: 8, rpe: 6.5, rest_sec: ACC_REST },
          { weight_kg: 40, reps: 8, rpe: 7, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'c-core',
        role: 'core',
        exercise_id: 'side_plank',
        alternatives: [],
        sets: [
          { weight_kg: 0, reps: 20, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 0, reps: 20, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 0, reps: 20, rpe: 7, rest_sec: CORE_REST },
        ],
      },
    ],
  },
  D: {
    id: 'D',
    weekday: 'Fri',
    title: 'Bench volume',
    focus: 'Bench volume + light squat',
    slots: [
      {
        slot_id: 'd-t1',
        role: 'T1',
        exercise_id: 'bench_regular_volume',
        alternatives: [],
        sets: [
          { weight_kg: 30, reps: 8, rpe: 7, rest_sec: 120 },
          { weight_kg: 30, reps: 8, rpe: 7, rest_sec: 120 },
          { weight_kg: 30, reps: 8, rpe: 7, rest_sec: 120 },
          { weight_kg: 30, reps: 8, rpe: 7.5, rest_sec: 120 },
          { weight_kg: 30, reps: 8, rpe: 8, rest_sec: 120 },
        ],
      },
      {
        slot_id: 'd-squat',
        role: 'accessory',
        exercise_id: 'front_squat_light',
        alternatives: ['goblet_squat', 'squat_goblet'],
        sets: [
          { weight_kg: 30, reps: 8, rpe: 6.5, rest_sec: ACC_REST },
          { weight_kg: 30, reps: 8, rpe: 7, rest_sec: ACC_REST },
          { weight_kg: 30, reps: 8, rpe: 7, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'd-pull',
        role: 'accessory',
        exercise_id: 'pull_up',
        alternatives: ['pull_up_band', 'lat_pulldown_band'],
        sets: [
          { weight_kg: 0, reps: 6, rpe: 7, amrap: true, rest_sec: ACC_REST },
          { weight_kg: 0, reps: 6, rpe: 7, amrap: true, rest_sec: ACC_REST },
          { weight_kg: 0, reps: 6, rpe: 8, amrap: true, rest_sec: ACC_REST },
        ],
      },
      {
        slot_id: 'd-curl',
        role: 'optional',
        exercise_id: 'curl_db',
        alternatives: [],
        optional: true,
        sets: [
          { weight_kg: 8, reps: 12, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 8, reps: 12, rpe: 7.5, rest_sec: CORE_REST },
        ],
      },
      {
        slot_id: 'd-tri',
        role: 'optional',
        exercise_id: 'tricep_pushdown_band',
        alternatives: [],
        optional: true,
        sets: [
          { weight_kg: 0, reps: 12, rpe: 7, rest_sec: CORE_REST },
          { weight_kg: 0, reps: 12, rpe: 7.5, rest_sec: CORE_REST },
        ],
      },
    ],
  },
};

export const DEFAULT_TEMPLATE_DAY: CanonicalTemplateDay = 'A';

export function templateFor(day: CanonicalTemplateDay): DayTemplate {
  return DAY_TEMPLATES[day];
}

export function exerciseName(id: ExerciseId): string {
  return EXERCISE_CATALOG[id].name;
}

export function restSecondsForSet(template: DayTemplate, liftIndex: number, setIndex: number): number {
  return template.slots[liftIndex]?.sets[setIndex]?.rest_sec ?? ACC_REST;
}
