import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES, DEFAULT_TEMPLATE_DAY } from '../data/templates';
import { createDraftSession, swapLiftExercise } from './sessionFactory';
import { canonicalTemplateDay } from './templateDay';

describe('seed templates', () => {
  it('defaults to Monday / A', () => {
    expect(DEFAULT_TEMPLATE_DAY).toBe('A');
    expect(canonicalTemplateDay('Mon')).toBe('A');
  });

  it('Monday A is squat T1 plus rdl, lunge or goblet, plank or dead bug', () => {
    const ids = DAY_TEMPLATES.A.slots.map((s) => s.exercise_id);
    const alts = DAY_TEMPLATES.A.slots.flatMap((s) => s.alternatives);
    expect(ids).toContain('squat_low_bar');
    expect(ids).toContain('rdl');
    expect(ids).toContain('reverse_lunge');
    expect(alts).toContain('goblet_squat');
    expect(ids).toContain('plank');
    expect(alts).toContain('dead_bug');
  });

  it('Tuesday B is bench plus row, OHP, pull-aparts', () => {
    const ids = DAY_TEMPLATES.B.slots.map((s) => s.exercise_id);
    const alts = DAY_TEMPLATES.B.slots.flatMap((s) => s.alternatives);
    expect(ids).toContain('bench_regular');
    expect(ids).toContain('row_barbell');
    expect(alts).toContain('row_db');
    expect(ids).toContain('overhead_press');
    expect(ids).toContain('band_pull_apart');
  });

  it('Thursday C is conventional deadlift plus glute, light rdl, side plank', () => {
    const ids = DAY_TEMPLATES.C.slots.map((s) => s.exercise_id);
    const alts = DAY_TEMPLATES.C.slots.flatMap((s) => s.alternatives);
    expect(ids).toContain('deadlift_conventional');
    expect(ids).toContain('glute_bridge');
    expect(alts).toContain('hip_thrust');
    expect(ids).toContain('rdl');
    expect(ids).toContain('side_plank');
  });

  it('Friday D is bench volume plus light squat, pull-up, optional arms', () => {
    const ids = DAY_TEMPLATES.D.slots.map((s) => s.exercise_id);
    const alts = DAY_TEMPLATES.D.slots.flatMap((s) => s.alternatives);
    expect(ids).toContain('bench_regular_volume');
    expect(ids).toContain('front_squat_light');
    expect(alts).toContain('goblet_squat');
    expect(ids).toContain('pull_up');
    expect(alts).toContain('pull_up_band');
    expect(ids).toContain('curl_db');
    expect(ids).toContain('tricep_pushdown_band');
    expect(DAY_TEMPLATES.D.slots.filter((s) => s.optional).map((s) => s.exercise_id)).toEqual([
      'curl_db',
      'tricep_pushdown_band',
    ]);
  });
});

describe('session factory', () => {
  it('builds a SessionLog-shaped draft with kg/reps/rpe/amrap', () => {
    const draft = createDraftSession('Mon', '2026-09-03');
    expect(draft.template_day).toBe('A');
    expect(draft.date).toBe('2026-09-03');
    expect(draft.pain_flag).toBe(false);
    expect(draft.lifts[0]?.exercise_id).toBe('squat_low_bar');
    const amrap = draft.lifts[0].sets.find((s) => s.amrap);
    expect(amrap).toMatchObject({
      weight_kg: expect.any(Number),
      reps: expect.any(Number),
      rpe: expect.any(Number),
      completed: false,
      amrap: true,
    });
  });

  it('swaps an alternative without dropping set slots', () => {
    const draft = createDraftSession('B');
    const swapped = swapLiftExercise(draft, 1, 'row_db');
    expect(swapped.lifts[1]?.exercise_id).toBe('row_db');
    expect(swapped.lifts[1]?.sets).toHaveLength(draft.lifts[1].sets.length);
  });
});
