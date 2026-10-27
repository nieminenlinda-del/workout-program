import type { DayTemplate, SeedSet, TemplateSlot } from '../data/templates';
import type { ExerciseId } from '../types/exercises';
import type { CanonicalTemplateDay } from '../types/session';

/**
 * Block B week 4 (Mon 26 Oct–Sun 1 Nov 2026) replaces the planned deload.
 * Linda strained her lower/mid back deadlifting on 22 Oct. B5 is not a
 * calendar week: Block B ends 1 Nov, and week index 5 has no table row.
 * The next week is Block C week 1.
 */
export const RECOVERY_RULE =
  'Recovery week: pain-free only, RPE ≤6. No squats, RDLs, hip thrusts, planks or barbell bench this week.';

export const RECOVERY_DAILY_NOTE = 'Walk + 5–10 min mobility.';

export const RECOVERY_DAY_D_ALT = "If bending isn't OK: repeat Tuesday's session instead.";

export const RECOVERY_BENCH_ALT =
  'If your back tolerates it, you may do paused bench 35 kg 3×5 instead.';

export const RECOVERY_DL_CUES =
  'slow 3 s up, soft lockout, 360° brace, no belt, film side-on, only if bending is near normal';

/** Monday of this week is walk-only. Dated so later Mondays stay Day A. */
export const RECOVERY_SKIPPED_DATE = '2026-10-26';

const RECOVERY_RPE = '≤6';
const ARM_LABEL = 'enter kg · 3 × 10 / arm';

export const RECOVERY_PICKER_NAMES: Record<CanonicalTemplateDay, string> = {
  A: 'Walk',
  B: 'Press',
  C: 'Press',
  D: 'DL',
};

function work(
  reps: number,
  weight_kg: number,
  rest_sec: number,
  extra: Partial<SeedSet> = {},
): SeedSet[] {
  return Array.from({ length: 3 }, () => ({
    weight_kg,
    reps,
    rpe: 6,
    rpe_label: RECOVERY_RPE,
    rest_sec,
    ...extra,
  }));
}

function openArm(note: string, slotId: string, exerciseId: ExerciseId): TemplateSlot {
  return {
    slot_id: slotId,
    role: 'accessory',
    exercise_id: exerciseId,
    alternatives: [],
    note,
    plan_label: ARM_LABEL,
    skipWarmup: true,
    sets: work(10, 0, 90, { open_load: true }),
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
    sets: work(8, 0, 60),
  };
}

function day(template: Omit<DayTemplate, 'slots'> & { slots: TemplateSlot[] }): DayTemplate {
  return template;
}

const DAY_B = day({
  id: 'B',
  weekday: 'Tue',
  title: 'Recovery · press and pull',
  focus: 'Day B',
  slots: [
    openArm('Per arm.', 'b4-press', 'press_db_seated_single'),
    openArm('Per arm.', 'b4-row', 'row_db_chest_single'),
    {
      slot_id: 'b4-pull',
      role: 'accessory',
      exercise_id: 'pull_up_cable',
      alternatives: [],
      note: 'From a dead hang.',
      plan_label: '15–20 kg assist · 3 × 6–8',
      skipWarmup: true,
      sets: work(8, 15, 90),
    },
    sideCore('b4-bird', 'bird_dog'),
  ],
});

const DAY_C = day({
  id: 'C',
  weekday: 'Thu',
  title: 'Recovery · press and pull',
  focus: 'Day C',
  slots: [
    openArm(RECOVERY_BENCH_ALT, 'c4-press', 'press_db_seated_single'),
    openArm('Per arm.', 'c4-row', 'row_db_chest_single'),
    {
      slot_id: 'c4-band',
      role: 'accessory',
      exercise_id: 'band_pull_apart',
      alternatives: [],
      skipWarmup: true,
      sets: work(15, 0, 60),
    },
    {
      slot_id: 'c4-bridge',
      role: 'accessory',
      exercise_id: 'glute_bridge',
      alternatives: [],
      skipWarmup: true,
      sets: work(12, 0, 60),
    },
    sideCore('c4-bug', 'dead_bug'),
  ],
});

const DAY_D = day({
  id: 'D',
  weekday: 'Fri',
  title: 'Recovery · empty-bar deadlift',
  focus: 'Day D',
  slots: [
    {
      slot_id: 'd4-dl',
      role: 'accessory',
      exercise_id: 'deadlift_conventional',
      alternatives: [],
      displayName: 'Empty-bar deadlift',
      note: RECOVERY_DL_CUES,
      skipWarmup: true,
      sets: work(5, 20, 180),
    },
    openArm('Per arm.', 'd4-row', 'row_db_chest_single'),
    sideCore('d4-bird', 'bird_dog'),
  ],
});

const DAY_A = day({
  id: 'A',
  weekday: 'Mon',
  title: 'Skipped · walk only',
  focus: 'Monday 26 Oct. Not a missed session.',
  slots: [],
});

const BY_DAY: Record<CanonicalTemplateDay, DayTemplate> = {
  A: DAY_A,
  B: DAY_B,
  C: DAY_C,
  D: DAY_D,
};

/** Full replacement for a Block B week-4 template day. Caller checks the week. */
export function recoveryTemplateFor(day: CanonicalTemplateDay): DayTemplate {
  return BY_DAY[day];
}

/**
 * Lines for a B4 day. Training days get the rule. Every day gets the walk
 * note. Monday adds the skipped line. Friday adds the bend check.
 */
export function recoveryNoteLines(day: CanonicalTemplateDay | 'rest'): string[] {
  const lines: string[] = [];
  if (day !== 'rest') lines.push(RECOVERY_RULE);
  lines.push(RECOVERY_DAILY_NOTE);
  if (day === 'A') lines.push('Skipped. Walk only. Not a missed session.');
  if (day === 'D') lines.push(RECOVERY_DAY_D_ALT);
  return lines;
}
