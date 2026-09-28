import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { createDraftSession } from './sessionFactory';
import {
  applyProgramWeek,
  blockWeekContext,
  dayTemplateForDate,
  isBlockADeloadWeek,
  programWeekIndex,
  t1PrescriptionFor,
  weekIndexFromStart,
} from './programWeek';
import { calendarTemplateDay, defaultTemplateDayForDate } from './templateDay';
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

  it('Kraft trip: product week 3 from Sun 20 Sep (calendar still 2 that day)', () => {
    expect(weekIndexFromStart('2026-09-19', '2026-09-07')).toBe(2);
    expect(programWeekIndex('2026-09-19', '2026-09-07')).toBe(2);
    expect(blockWeekContext('2026-09-19')?.weekIndex).toBe(2);
    expect(programWeekIndex('2026-09-20', '2026-09-07')).toBe(3);
    expect(blockWeekContext('2026-09-20')).toMatchObject({
      block: 'A',
      weekIndex: 3,
    });
    expect(blockWeekContext('2026-09-27')?.weekIndex).toBe(3);
    expect(blockWeekContext('2026-09-28')?.weekIndex).toBe(4);
    expect(programWeekIndex('2026-10-04', '2026-09-07')).toBe(4);
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
    expect(t1PrescriptionFor('A', '2026-09-19')?.weight_kg).toBe(57.5);
  });

  it('Week 3 locked from Sun 20 Sep: squat 60×3×3; bench 42.5×3×4; DL 72.5×3×3; D 42.5×2×4', () => {
    expect(t1PrescriptionFor('A', '2026-09-20')).toEqual({
      weight_kg: 60,
      set_count: 3,
      reps: 3,
      rpe: [7.5, 8, 8],
      note: 'Soft-cap ≤8 this week.',
    });
    expect(t1PrescriptionFor('B', '2026-09-20')).toMatchObject({
      weight_kg: 42.5,
      set_count: 3,
      reps: 4,
      rpe: [7.5, 8, 8],
    });
    expect(t1PrescriptionFor('C', '2026-09-23')).toMatchObject({
      weight_kg: 72.5,
      set_count: 3,
      reps: 3,
      rpe: [7.5, 8, 8],
    });
    expect(t1PrescriptionFor('D', '2026-09-24')).toMatchObject({
      weight_kg: 42.5,
      set_count: 2,
      reps: 4,
      rpe: [7, 7.5],
    });
  });

  it('Week 4 deload (28 Sep–4 Oct): squat 45×2×5, bench 32.5×2×5, DL 55×2×5, Fri 32.5×2×5 @ RPE 5–6', () => {
    const deload = {
      set_count: 2,
      reps: 5,
      rpe: [5, 6],
      rpe_label: '5–6',
      note: 'Deload. RPE 5–6.',
    };
    expect(isBlockADeloadWeek('2026-09-27')).toBe(false);
    expect(isBlockADeloadWeek('2026-09-28')).toBe(true);
    expect(isBlockADeloadWeek('2026-10-04')).toBe(true);
    expect(isBlockADeloadWeek('2026-10-05')).toBe(false);

    expect(t1PrescriptionFor('A', '2026-09-28')).toEqual({ weight_kg: 45, ...deload });
    expect(t1PrescriptionFor('B', '2026-09-29')).toEqual({ weight_kg: 32.5, ...deload });
    // Day C is the same load on Wed or Thu — she may deadlift either day.
    expect(t1PrescriptionFor('C', '2026-09-30')).toEqual({ weight_kg: 55, ...deload });
    expect(t1PrescriptionFor('C', '2026-10-01')).toEqual({ weight_kg: 55, ...deload });
    expect(dayTemplateForDate('C', '2026-09-30').slots[0]?.sets.map((set) => set.weight_kg)).toEqual([
      55, 55,
    ]);
    expect(dayTemplateForDate('C', '2026-10-01').slots[0]?.sets.map((set) => set.rpe_label)).toEqual([
      '5–6',
      '5–6',
    ]);
    expect(t1PrescriptionFor('D', '2026-10-02')).toEqual({ weight_kg: 32.5, ...deload });

    // Sun 4 Oct is the last deload day. Mon 5 Oct is Block B and stays off this table.
    expect(blockWeekContext('2026-10-04')).toMatchObject({ block: 'A', weekIndex: 4, end: '2026-10-04' });
    expect(t1PrescriptionFor('A', '2026-10-04')).toEqual({ weight_kg: 45, ...deload });
    expect(t1PrescriptionFor('C', '2026-10-04')?.weight_kg).toBe(55);
    expect(t1PrescriptionFor('A', '2026-09-06')).toBeNull();
    expect(t1PrescriptionFor('A', '2026-10-05')).toBeNull();
    expect(t1PrescriptionFor('C', '2026-10-05')).toBeNull();
  });

  it('does not invent +2.5 on bench or deadlift in weeks 1–2', () => {
    expect(t1PrescriptionFor('B', '2026-09-08')?.weight_kg).toBe(40);
    expect(t1PrescriptionFor('B', '2026-09-15')?.weight_kg).toBe(40);
    expect(t1PrescriptionFor('C', '2026-09-10')?.weight_kg).toBe(70);
    expect(t1PrescriptionFor('C', '2026-09-17')?.weight_kg).toBe(70);
  });
});

describe('Kraft trip day-of-week defaults', () => {
  it('Wed 23 → C and Thu 24 → D; Fri 25 is rest; Sun 20 is picker-driven', () => {
    expect(defaultTemplateDayForDate('2026-09-20')).toBeNull();
    expect(calendarTemplateDay('2026-09-20')).toBe('rest');
    expect(defaultTemplateDayForDate('2026-09-23')).toBe('C');
    expect(defaultTemplateDayForDate('2026-09-24')).toBe('D');
    expect(defaultTemplateDayForDate('2026-09-25')).toBeNull();
    expect(calendarTemplateDay('2026-09-25')).toBe('rest');
  });

  it('normal weeks stay Mon A / Tue B / Thu C / Fri D', () => {
    expect(defaultTemplateDayForDate('2026-09-14')).toBe('A');
    expect(defaultTemplateDayForDate('2026-09-15')).toBe('B');
    expect(defaultTemplateDayForDate('2026-09-16')).toBeNull();
    expect(defaultTemplateDayForDate('2026-09-17')).toBe('C');
    expect(defaultTemplateDayForDate('2026-09-18')).toBe('D');
    expect(defaultTemplateDayForDate('2026-09-28')).toBe('A');
    expect(defaultTemplateDayForDate('2026-09-29')).toBe('B');
    expect(defaultTemplateDayForDate('2026-10-01')).toBe('C');
    expect(defaultTemplateDayForDate('2026-10-02')).toBe('D');
  });

  it('Week 4 deadlift opens on Wed 30 Sep and stays scheduled on Thu 1 Oct; Sun 4 Oct is rest', () => {
    expect(defaultTemplateDayForDate('2026-09-30')).toBe('C');
    expect(calendarTemplateDay('2026-09-30')).toBe('rest');
    expect(defaultTemplateDayForDate('2026-10-01')).toBe('C');
    expect(calendarTemplateDay('2026-10-01')).toBe('C');
    expect(defaultTemplateDayForDate('2026-10-04')).toBeNull();
    expect(blockWeekContext('2026-10-04')?.weekIndex).toBe(4);
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

  it('Week 3 Day A squat is 60 × 3×3 with warmups from 60', () => {
    const preview = plannedDayPreview(DAY_TEMPLATES.A, [], '2026-09-20');
    const squat = preview[0];
    expect(squat?.workLabel).toBe('60 kg · 3 × 3');
    expect(squat?.scheme).toBe('3 × 3');
    expect(squat?.note).toMatch(/≤8/);
    expect(squat?.sets.filter((s) => !s.warmup).every((s) => s.weight_kg === 60 && s.reps === 3)).toBe(
      true,
    );

    const draft = createDraftSession('A', '2026-09-20');
    const work = draft.lifts[0].sets.filter((s) => !s.warmup);
    expect(work.map((s) => s.weight_kg)).toEqual([60, 60, 60]);
    expect(work.map((s) => s.reps)).toEqual([3, 3, 3]);
    expect(draft.lifts[0].sets.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual(
      warmupLadder(60, 'squat').map((s) => s.weight_kg),
    );
  });

  it('leaves accessories on the seed template', () => {
    const week2 = applyProgramWeek(DAY_TEMPLATES.A, '2026-09-14');
    expect(week2.slots[1]?.sets.map((s) => s.weight_kg)).toEqual(
      DAY_TEMPLATES.A.slots[1].sets.map((s) => s.weight_kg),
    );
    const week3 = applyProgramWeek(DAY_TEMPLATES.A, '2026-09-20');
    expect(week3.slots[1]?.sets.map((s) => s.weight_kg)).toEqual(
      DAY_TEMPLATES.A.slots[1].sets.map((s) => s.weight_kg),
    );
    expect(week3.slots[2]?.sets.map((s) => s.weight_kg)).toEqual(
      DAY_TEMPLATES.A.slots[2].sets.map((s) => s.weight_kg),
    );
    const week4 = applyProgramWeek(DAY_TEMPLATES.A, '2026-09-28');
    expect(week4.slots[0]?.sets.map((s) => s.weight_kg)).toEqual([45, 45]);
    expect(week4.slots[1]?.sets.map((s) => s.weight_kg)).toEqual(
      DAY_TEMPLATES.A.slots[1].sets.map((s) => s.weight_kg),
    );
    expect(week4.slots[2]?.sets.map((s) => s.weight_kg)).toEqual(
      DAY_TEMPLATES.A.slots[2].sets.map((s) => s.weight_kg),
    );
    expect(week4.slots.slice(1).every((slot) => slot.sets.every((set) => set.rpe_label == null))).toBe(
      true,
    );
  });

  it('Week 4 Day A squat is the deload 45 × 2×5 @ RPE 5–6', () => {
    const preview = plannedDayPreview(DAY_TEMPLATES.A, [], '2026-09-28');
    const squat = preview[0];
    expect(squat?.workLabel).toBe('45 kg · 2 × 5');
    expect(squat?.note).toBe('Deload. RPE 5–6.');
    expect(squat?.sets.filter((s) => !s.warmup).map((s) => s.rpe_label)).toEqual(['5–6', '5–6']);

    const draft = createDraftSession('A', '2026-09-28');
    const work = draft.lifts[0].sets.filter((s) => !s.warmup);
    expect(work.map((s) => s.weight_kg)).toEqual([45, 45]);
    expect(work.map((s) => s.reps)).toEqual([5, 5]);
    expect(work.map((s) => s.rpe)).toEqual([5, 6]);
    expect(work.map((s) => s.rpe_label)).toEqual(['5–6', '5–6']);
    expect(draft.lifts[0].sets.filter((s) => s.warmup).every((s) => s.rpe_label == null)).toBe(true);
  });
});
