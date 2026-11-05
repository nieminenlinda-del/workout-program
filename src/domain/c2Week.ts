import type { DayTemplate, SeedSet, TemplateSlot } from '../data/templates';
import type { CanonicalTemplateDay } from '../types/session';

/**
 * Block C week 2 (Mon 9–Sun 15 Nov 2026) replaces the frozen peak table.
 * The test week (16–20 Nov) has its own templates in `cyclePlan.ts`.
 */
export const C2_STOP_RULE =
  'Stop rule: pain >2/10 or any leg symptoms = stop that lift, switch to supported DB work.';

export const C2_MEET_NOTE = 'Full three-lift test planned for ~mid-December (date TBD).';

export const C2_DL_NOTE = 'No belt. Film side-on.';

export const C2_DL_OPTIONAL = 'Only if pain-free and moving well.';

const REST_MAIN = 180;

export const C2_PICKER_NAMES: Record<CanonicalTemplateDay, string> = {
  A: 'Squat',
  B: 'Bench',
  C: 'DL',
  D: 'Squat',
};

function sets(count: number, reps: number, weight_kg: number, extra: Partial<SeedSet> = {}): SeedSet[] {
  return Array.from({ length: count }, () => ({
    weight_kg,
    reps,
    rpe: 6,
    rest_sec: REST_MAIN,
    ...extra,
  }));
}

function single(weight_kg: number): SeedSet {
  return { weight_kg, reps: 1, rpe: 6, rest_sec: REST_MAIN, part_label: 'Top' };
}

function day(template: Omit<DayTemplate, 'slots'> & { slots: TemplateSlot[] }): DayTemplate {
  return template;
}

const DAY_A = day({
  id: 'A',
  weekday: 'Mon',
  title: 'C2 · squat and bench',
  focus: 'Day A',
  slots: [
    {
      slot_id: 'c2a-squat',
      role: 'T1',
      exercise_id: 'squat_low_bar',
      alternatives: [],
      sets: sets(3, 5, 55),
    },
    {
      slot_id: 'c2a-bench',
      role: 'T1',
      exercise_id: 'bench_regular',
      alternatives: [],
      sets: [single(47.5), ...sets(3, 4, 42.5)],
    },
  ],
});

const DAY_B = day({
  id: 'B',
  weekday: 'Tue',
  title: 'C2 · bench',
  focus: 'Day B',
  slots: [
    {
      slot_id: 'c2b-bench',
      role: 'T1',
      exercise_id: 'bench_regular',
      alternatives: [],
      sets: [single(50), ...sets(3, 3, 45)],
    },
  ],
});

const DAY_C = day({
  id: 'C',
  weekday: 'Thu',
  title: 'C2 · deadlift',
  focus: 'Day C',
  slots: [
    {
      slot_id: 'c2c-dl',
      role: 'T1',
      exercise_id: 'deadlift_conventional',
      alternatives: [],
      displayName: 'Deadlift from the floor',
      note: C2_DL_NOTE,
      sets: sets(3, 5, 55),
    },
    {
      slot_id: 'c2c-dl-opt',
      role: 'optional',
      exercise_id: 'deadlift_conventional',
      alternatives: [],
      displayName: 'Deadlift from the floor',
      optional: true,
      note: C2_DL_OPTIONAL,
      skipWarmup: true,
      sets: sets(2, 3, 60),
    },
  ],
});

const DAY_D = day({
  id: 'D',
  weekday: 'Fri',
  title: 'C2 · squat and bench',
  focus: 'Day D',
  slots: [
    {
      slot_id: 'c2d-squat',
      role: 'T1',
      exercise_id: 'squat_low_bar',
      alternatives: [],
      sets: sets(3, 3, 57.5),
    },
    {
      slot_id: 'c2d-bench',
      role: 'T1',
      exercise_id: 'bench_regular',
      alternatives: [],
      sets: sets(3, 3, 42.5),
    },
  ],
});

const BY_DAY: Record<CanonicalTemplateDay, DayTemplate> = {
  A: DAY_A,
  B: DAY_B,
  C: DAY_C,
  D: DAY_D,
};

/** Full replacement for a Block C week-2 template day. Caller checks the week. */
export function c2TemplateFor(day: CanonicalTemplateDay): DayTemplate {
  return BY_DAY[day];
}
