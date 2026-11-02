import type { DayTemplate, SeedSet, TemplateSlot } from '../data/templates';
import type { ExerciseId } from '../types/exercises';
import type { CanonicalTemplateDay } from '../types/session';

/**
 * Block C week 1 (Mon 2–Sun 8 Nov 2026) replaces the capped peak table.
 * These are conservative return-to-load sessions after the back strain.
 * C2 and the test week stay on their own tables.
 */
export const C1_RETURN_RULE =
  'Stop a lift if pain goes above 2/10 or with any leg symptoms, and switch to supported DB work.';

export const C1_BENCH_ALT =
  'Alternative: seated single-arm DB press. The 40 kg is the barbell; enter the dumbbell weight if you swap.';

export const C1_SQUAT_REPEAT = "Or repeat 45 kg if Monday didn't feel fine.";

export const C1_DL_CUES = '~3 s up, soft lockout. Plates, no belt, film side-on.';

export const C1_DL_OPTIONAL = 'Only if the 40 kg sets are easy and pain-free.';

const ARM_LABEL = 'enter kg · 3 × 10';
const REST_MAIN = 180;
const REST_ACC = 90;
const REST_CORE = 60;

export const C1_PICKER_NAMES: Record<CanonicalTemplateDay, string> = {
  A: 'Squat',
  B: 'Bench',
  C: 'DL',
  D: 'Squat',
};

function sets(
  count: number,
  reps: number,
  weight_kg: number,
  rest_sec: number,
  extra: Partial<SeedSet> = {},
): SeedSet[] {
  return Array.from({ length: count }, () => ({
    weight_kg,
    reps,
    rpe: 6,
    rest_sec,
    ...extra,
  }));
}

function openDb(slotId: string, exerciseId: ExerciseId, note: string): TemplateSlot {
  return {
    slot_id: slotId,
    role: 'accessory',
    exercise_id: exerciseId,
    alternatives: [],
    note,
    plan_label: ARM_LABEL,
    skipWarmup: true,
    sets: sets(3, 10, 0, REST_ACC, { open_load: true }),
  };
}

function sideCore(slotId: string, exerciseId: ExerciseId): TemplateSlot {
  return {
    slot_id: slotId,
    role: 'core',
    exercise_id: exerciseId,
    alternatives: [],
    note: 'Per side.',
    plan_label: 'BW · 3 × 8 / side',
    skipWarmup: true,
    sets: sets(3, 8, 0, REST_CORE),
  };
}

function day(template: Omit<DayTemplate, 'slots'> & { slots: TemplateSlot[] }): DayTemplate {
  return template;
}

const DAY_A = day({
  id: 'A',
  weekday: 'Mon',
  title: 'Return · squat and bench',
  focus: 'Day A',
  slots: [
    {
      slot_id: 'c1a-squat',
      role: 'T1',
      exercise_id: 'squat_low_bar',
      alternatives: [],
      note: 'Slow, controlled.',
      sets: sets(3, 5, 45, REST_MAIN),
    },
    {
      slot_id: 'c1a-bench',
      role: 'T1',
      exercise_id: 'bench_regular',
      alternatives: [],
      note: C1_BENCH_ALT,
      sets: sets(3, 5, 40, REST_MAIN),
    },
    sideCore('c1a-bird', 'bird_dog'),
  ],
});

const DAY_B = day({
  id: 'B',
  weekday: 'Tue',
  title: 'Return · bench',
  focus: 'Day B',
  slots: [
    {
      slot_id: 'c1b-bench',
      role: 'T1',
      exercise_id: 'bench_regular',
      alternatives: [],
      sets: [
        { weight_kg: 47.5, reps: 1, rpe: 6, rest_sec: REST_MAIN, part_label: 'Top' },
        ...sets(3, 4, 42.5, REST_MAIN),
      ],
    },
    openDb('c1b-row', 'row_db_chest_single', 'Per arm.'),
    {
      slot_id: 'c1b-pull',
      role: 'accessory',
      exercise_id: 'pull_up_cable',
      alternatives: [],
      note: 'From a dead hang. Enter the cable assist.',
      plan_label: 'assist kg · 3 × 6–8',
      skipWarmup: true,
      sets: sets(3, 8, 0, REST_ACC, { open_load: true }),
    },
  ],
});

const DAY_C = day({
  id: 'C',
  weekday: 'Thu',
  title: 'Return · deadlift',
  focus: 'Day C',
  slots: [
    {
      slot_id: 'c1c-dl',
      role: 'T1',
      exercise_id: 'deadlift_conventional',
      alternatives: [],
      displayName: 'Deadlift from the floor',
      note: C1_DL_CUES,
      sets: sets(3, 5, 40, REST_MAIN),
    },
    {
      slot_id: 'c1c-dl-opt',
      role: 'optional',
      exercise_id: 'deadlift_conventional',
      alternatives: [],
      displayName: 'Deadlift from the floor',
      optional: true,
      note: C1_DL_OPTIONAL,
      skipWarmup: true,
      sets: sets(2, 5, 50, REST_MAIN),
    },
    {
      slot_id: 'c1c-paused',
      role: 'T1',
      exercise_id: 'bench_regular',
      alternatives: [],
      displayName: 'Bench press · paused',
      note: 'Paused.',
      sets: sets(3, 5, 35, REST_MAIN),
    },
    {
      slot_id: 'c1c-bridge',
      role: 'accessory',
      exercise_id: 'glute_bridge',
      alternatives: [],
      skipWarmup: true,
      sets: sets(3, 12, 0, REST_CORE),
    },
    sideCore('c1c-bug', 'dead_bug'),
  ],
});

const DAY_D = day({
  id: 'D',
  weekday: 'Fri',
  title: 'Return · squat and bench',
  focus: 'Day D',
  slots: [
    {
      slot_id: 'c1d-squat',
      role: 'T1',
      exercise_id: 'squat_low_bar',
      alternatives: [],
      note: C1_SQUAT_REPEAT,
      sets: sets(3, 5, 50, REST_MAIN),
    },
    {
      slot_id: 'c1d-bench',
      role: 'T1',
      exercise_id: 'bench_regular',
      alternatives: [],
      sets: sets(3, 5, 40, REST_MAIN),
    },
    openDb('c1d-row', 'row_db', 'Enter the weight.'),
  ],
});

const BY_DAY: Record<CanonicalTemplateDay, DayTemplate> = {
  A: DAY_A,
  B: DAY_B,
  C: DAY_C,
  D: DAY_D,
};

/** Full replacement for a Block C week-1 template day. Caller checks the week. */
export function c1ReturnTemplateFor(day: CanonicalTemplateDay): DayTemplate {
  return BY_DAY[day];
}
