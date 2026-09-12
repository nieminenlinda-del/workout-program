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

  it('Thursday C is conventional deadlift plus hip thrust, light rdl, side plank', () => {
    const ids = DAY_TEMPLATES.C.slots.map((s) => s.exercise_id);
    const alts = DAY_TEMPLATES.C.slots.flatMap((s) => s.alternatives);
    expect(ids).toContain('deadlift_conventional');
    expect(ids).toContain('hip_thrust');
    expect(alts).toContain('glute_bridge');
    expect(DAY_TEMPLATES.C.slots.find((s) => s.slot_id === 'c-glute')?.sets.map((s) => s.weight_kg)).toEqual([
      82.5, 82.5, 82.5,
    ]);
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
    expect(ids).toContain('cable_rope_pushdown');
    expect(alts).toContain('tricep_pushdown_band');
    expect(DAY_TEMPLATES.D.slots.filter((s) => s.optional).map((s) => s.exercise_id)).toEqual([
      'curl_db',
      'cable_rope_pushdown',
    ]);
    expect(DAY_TEMPLATES.D.slots.find((s) => s.slot_id === 'd-tri')?.sets.map((s) => s.weight_kg)).toEqual([
      12.5, 12.5,
    ]);
  });
});

describe('session factory', () => {
  it('builds a SessionLog-shaped draft with kg/reps/rpe and Day D AMRAP', () => {
    const draft = createDraftSession('Mon', '2026-09-03');
    expect(draft.template_day).toBe('A');
    expect(draft.date).toBe('2026-09-03');
    expect(draft.pain_flag).toBe(false);
    expect(draft.lifts[0]?.exercise_id).toBe('squat_low_bar');
    const squatWork = draft.lifts[0].sets.filter((s) => !s.warmup);
    expect(squatWork.map((s) => s.target_weight_kg)).toEqual([55, 55, 55]);
    expect(squatWork.map((s) => s.target_reps)).toEqual([5, 5, 5]);
    expect(squatWork.every((s) => !s.amrap)).toBe(true);

    const friday = createDraftSession('D', '2026-09-04');
    const tri = friday.lifts.find((l) => l.exercise_id === 'cable_rope_pushdown');
    expect(tri).toMatchObject({
      name: 'Cable rope pushdown',
      equipment: 'cable',
    });
    expect(tri?.sets.filter((s) => !s.warmup).map((s) => s.weight_kg)).toEqual([12.5, 12.5]);
    const pull = friday.lifts.find((l) => l.exercise_id === 'pull_up');
    const amrap = pull?.sets.find((s) => s.amrap);
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

  it('seeds Week 1 Kraft ladders on T1 squat, bench, and deadlift', () => {
    const squat = createDraftSession('A', '2026-09-07').lifts[0].sets.filter((s) => s.warmup);
    const bench = createDraftSession('B', '2026-09-08').lifts[0].sets.filter((s) => s.warmup);
    const dl = createDraftSession('C', '2026-09-10').lifts[0].sets.filter((s) => s.warmup);
    expect(squat.map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }))).toEqual([
      { weight_kg: 20, reps: 5 },
      { weight_kg: 27.5, reps: 5 },
      { weight_kg: 37.5, reps: 3 },
      { weight_kg: 47.5, reps: 2 },
    ]);
    expect(bench.map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }))).toEqual([
      { weight_kg: 20, reps: 5 },
      { weight_kg: 27.5, reps: 5 },
      { weight_kg: 35, reps: 3 },
    ]);
    expect(dl.map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }))).toEqual([
      { weight_kg: 20, reps: 5 },
      { weight_kg: 40, reps: 5 },
      { weight_kg: 50, reps: 3 },
      { weight_kg: 60, reps: 2 },
    ]);

    const benchWork = createDraftSession('B', '2026-09-08').lifts[0].sets.filter((s) => !s.warmup);
    const dlWork = createDraftSession('C', '2026-09-10').lifts[0].sets.filter((s) => !s.warmup);
    const volumeWork = createDraftSession('D', '2026-09-11').lifts[0].sets.filter((s) => !s.warmup);
    expect(benchWork.map((s) => s.weight_kg)).toEqual([40, 40, 40]);
    expect(dlWork.map((s) => s.weight_kg)).toEqual([70, 70, 70]);
    expect(volumeWork.map((s) => s.weight_kg)).toEqual([40, 40]);
    expect(volumeWork.map((s) => s.reps)).toEqual([5, 5]);
  });
});
