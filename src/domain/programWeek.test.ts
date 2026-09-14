import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { createDraftSession } from './sessionFactory';
import {
  applyProgramWeek,
  blockWeekContext,
  t1PrescriptionFor,
  weekIndexFromStart,
} from './programWeek';
import { plannedDayPreview } from './workoutPreview';
import { warmupLadder } from './warmupLadder';

describe('program week index (block start inclusive)', () => {
  it('counts week 1 from 7 Sep and week 2 from 14 Sep', () => {
    expect(weekIndexFromStart('2026-09-07', '2026-09-07')).toBe(1);
    expect(weekIndexFromStart('2026-09-13', '2026-09-07')).toBe(1);
    expect(weekIndexFromStart('2026-09-14', '2026-09-07')).toBe(2);
    expect(weekIndexFromStart('2026-09-20', '2026-09-07')).toBe(2);
    expect(weekIndexFromStart('2026-09-21', '2026-09-07')).toBe(3);
    expect(weekIndexFromStart('2026-10-04', '2026-09-07')).toBe(4);
    expect(blockWeekContext('2026-09-14')).toMatchObject({
      block: 'A',
      weekIndex: 2,
      start: '2026-09-07',
      end: '2026-10-04',
    });
    expect(blockWeekContext('2026-09-06')).toBeNull();
  });
});

describe('Block A Kraft T1 table (no auto +2.5)', () => {
  it('Week 1 rebase: squat 47.5×3×5; bench/DL/Fri hold seed loads', () => {
    expect(t1PrescriptionFor('A', '2026-09-07')).toMatchObject({
      weight_kg: 47.5,
      set_count: 3,
      reps: 5,
    });
    expect(t1PrescriptionFor('B', '2026-09-08')).toMatchObject({
      weight_kg: 40,
      set_count: 3,
      reps: 5,
    });
    expect(t1PrescriptionFor('C', '2026-09-10')).toMatchObject({
      weight_kg: 70,
      set_count: 3,
      reps: 5,
    });
    expect(t1PrescriptionFor('D', '2026-09-11')).toMatchObject({
      weight_kg: 40,
      set_count: 2,
      reps: 5,
    });
  });

  it('Week 2 locked: squat 57.5×3×4; bench 40×3×5; DL 70×3×4; Fri 40×2×5', () => {
    expect(t1PrescriptionFor('A', '2026-09-14')).toEqual({
      weight_kg: 57.5,
      set_count: 3,
      reps: 4,
      rpe: [7, 7, 7],
      note: 'Soft-cap ≤7 this week. 55 kg if first set is off.',
    });
    expect(t1PrescriptionFor('B', '2026-09-15')).toMatchObject({
      weight_kg: 40,
      set_count: 3,
      reps: 5,
    });
    expect(t1PrescriptionFor('C', '2026-09-17')).toMatchObject({
      weight_kg: 70,
      set_count: 3,
      reps: 4,
    });
    expect(t1PrescriptionFor('D', '2026-09-18')).toMatchObject({
      weight_kg: 40,
      set_count: 2,
      reps: 5,
    });
  });

  it('weeks 3–4 hold Week 2; off-block and Block B do not overlay', () => {
    expect(t1PrescriptionFor('A', '2026-09-21')?.weight_kg).toBe(57.5);
    expect(t1PrescriptionFor('A', '2026-10-04')?.reps).toBe(4);
    expect(t1PrescriptionFor('A', '2026-09-06')).toBeNull();
    expect(t1PrescriptionFor('A', '2026-10-05')).toBeNull();
  });

  it('does not invent +2.5 on bench or deadlift', () => {
    expect(t1PrescriptionFor('B', '2026-09-08')?.weight_kg).toBe(40);
    expect(t1PrescriptionFor('B', '2026-09-15')?.weight_kg).toBe(40);
    expect(t1PrescriptionFor('C', '2026-09-10')?.weight_kg).toBe(70);
    expect(t1PrescriptionFor('C', '2026-09-17')?.weight_kg).toBe(70);
  });
});

describe('createDraftSession matches plannedDayPreview', () => {
  it('Week 2 Day A squat is 57.5 × 3×4 with warmups from 57.5', () => {
    const preview = plannedDayPreview(DAY_TEMPLATES.A, [], '2026-09-14');
    const squat = preview[0];
    expect(squat?.workLabel).toBe('57.5 kg · 3 × 4');
    expect(squat?.scheme).toBe('3 × 4');
    expect(squat?.warmupLabel).toBe(
      `W ${warmupLadder(57.5, 'squat').map((s) => `${s.weight_kg} kg`).join(' → ')}`,
    );
    expect(squat?.note).toMatch(/Soft-cap/i);
    expect(squat?.sets.filter((s) => !s.warmup).every((s) => s.weight_kg === 57.5 && s.reps === 4)).toBe(
      true,
    );

    const draft = createDraftSession('A', '2026-09-14');
    const work = draft.lifts[0].sets.filter((s) => !s.warmup);
    expect(work.map((s) => s.weight_kg)).toEqual([57.5, 57.5, 57.5]);
    expect(work.map((s) => s.reps)).toEqual([4, 4, 4]);
    expect(draft.lifts[0].sets.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual(
      warmupLadder(57.5, 'squat').map((s) => s.weight_kg),
    );
  });

  it('leaves accessories on the seed template', () => {
    const resolved = applyProgramWeek(DAY_TEMPLATES.A, '2026-09-14');
    expect(resolved.slots[1]?.sets.map((s) => s.weight_kg)).toEqual(
      DAY_TEMPLATES.A.slots[1].sets.map((s) => s.weight_kg),
    );
  });
});
