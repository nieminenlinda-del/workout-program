import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { getMesocycleContext } from './phase2Calendar';
import { createDraftSession } from './sessionFactory';
import { calendarTemplateDay, defaultTemplateDayForDate } from './templateDay';
import { buildBlockPreview } from './blockPreview';
import { dayTemplateForDate, t1PrescriptionFor } from './programWeek';
import { plannedDayPreview } from './workoutPreview';
import {
  HOLD_RPE_ABOVE,
  isStepUp,
  shouldApplyHold,
  testWeekRole,
} from './cyclePlan';
import type { CanonicalTemplateDay, SessionLog } from '../types/session';

function workKg(date: string, day: CanonicalTemplateDay): number[] {
  const slot = dayTemplateForDate(day, date).slots[0];
  return slot?.sets.map((set) => set.weight_kg) ?? [];
}

function labels(date: string, day: CanonicalTemplateDay): string[] {
  return plannedDayPreview(DAY_TEMPLATES[day], [], date).map((row) => row.workLabel);
}

function loggedVariation(
  day: CanonicalTemplateDay,
  date: string,
  exerciseId: SessionLog['lifts'][number]['exercise_id'],
  rpes: number[],
): SessionLog {
  const draft = createDraftSession(day, date);
  draft.status = 'complete';
  const lift = draft.lifts.find((row) => row.exercise_id === exerciseId);
  const work = lift?.sets.filter((set) => !set.warmup) ?? [];
  work.forEach((set, index) => {
    set.completed = true;
    set.rpe = rpes[index] ?? rpes[rpes.length - 1] ?? 7;
  });
  return draft;
}

function loggedTop(day: CanonicalTemplateDay, date: string, rpe: number): SessionLog {
  const draft = createDraftSession(day, date);
  draft.status = 'complete';
  for (const set of draft.lifts[0]?.sets ?? []) {
    if (!set.warmup) {
      set.completed = true;
      set.rpe = rpe;
    }
  }
  return draft;
}

describe('Block B and C planned T1s', () => {
  it('B1 week of 5 Oct', () => {
    expect(workKg('2026-10-05', 'A')).toEqual([60, 60, 60]);
    expect(t1PrescriptionFor('A', '2026-10-05')).toMatchObject({ reps: 4, set_count: 3 });
    expect(workKg('2026-10-06', 'B')).toEqual([42.5, 42.5, 42.5]);
    expect(t1PrescriptionFor('B', '2026-10-06')?.reps).toBe(5);
    expect(workKg('2026-10-08', 'C')).toEqual([77.5, 77.5, 77.5]);
    expect(t1PrescriptionFor('C', '2026-10-08')?.reps).toBe(3);
    expect(workKg('2026-10-09', 'D')).toEqual([42.5, 42.5, 42.5]);
    expect(t1PrescriptionFor('D', '2026-10-09')).toMatchObject({ set_count: 3, reps: 5 });
    expect(dayTemplateForDate('A', '2026-10-05').slots.length).toBe(DAY_TEMPLATES.A.slots.length + 1);
  });

  it('B2 week of 12 Oct', () => {
    expect(t1PrescriptionFor('A', '2026-10-12')).toMatchObject({ weight_kg: 62.5, set_count: 3, reps: 3 });
    expect(t1PrescriptionFor('B', '2026-10-13')).toMatchObject({ weight_kg: 45, set_count: 3, reps: 3 });
    expect(t1PrescriptionFor('C', '2026-10-15')).toMatchObject({ weight_kg: 80, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('D', '2026-10-16')).toMatchObject({ weight_kg: 42.5, set_count: 3, reps: 4 });
  });

  it('B3 week of 19 Oct', () => {
    expect(t1PrescriptionFor('A', '2026-10-19')).toMatchObject({ weight_kg: 65, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('B', '2026-10-20')).toMatchObject({ weight_kg: 47.5, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('C', '2026-10-22')).toMatchObject({ weight_kg: 82.5, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('D', '2026-10-23')).toMatchObject({ weight_kg: 42.5, set_count: 3, reps: 3 });
  });

  it('B4 week of 26 Oct is a deload at RPE 5–6', () => {
    expect(getMesocycleContext('2026-10-26').weekIndex).toBe(4);
    expect(t1PrescriptionFor('A', '2026-10-26')).toMatchObject({
      weight_kg: 47.5,
      set_count: 2,
      reps: 4,
      rpe_label: '5–6',
      note: 'Deload. RPE 5–6.',
    });
    expect(t1PrescriptionFor('B', '2026-10-27')).toMatchObject({ weight_kg: 32.5, set_count: 2, reps: 5 });
    expect(t1PrescriptionFor('C', '2026-10-29')).toMatchObject({ weight_kg: 57.5, set_count: 2, reps: 3 });
    expect(t1PrescriptionFor('D', '2026-10-30')).toMatchObject({ weight_kg: 32.5, set_count: 2, reps: 5 });
    expect(labels('2026-10-26', 'A')[0]).toBe('47.5 kg · 2 × 4');
  });

  it('C1 week of 2 Nov keeps the capped top sets, adds one back-off, and brings accessories back at 2 sets', () => {
    expect(labels('2026-11-02', 'A').slice(0, 2)).toEqual([
      '67.5 kg × 1 then 60 kg × 2 × 2',
      '55 kg · 1 × 5',
    ]);
    expect(labels('2026-11-03', 'B').slice(0, 2)).toEqual([
      '47.5 kg × 1 then 42.5 kg × 2 × 2',
      '37.5 kg · 1 × 5',
    ]);
    expect(labels('2026-11-05', 'C').slice(0, 3)).toEqual([
      '87.5 kg × 1 then 77.5 kg × 2 × 2',
      '67.5 kg · 1 × 5',
      '35 kg · 2 × 5',
    ]);
    expect(labels('2026-11-06', 'D')[0]).toBe('40 kg · 2 × 3');
    const monday = dayTemplateForDate('A', '2026-11-02');
    expect(monday.slots[0]?.sets.map((set) => set.part_label)).toEqual(['Top', 'B1', 'B2']);
    expect(monday.slots[1]?.displayName).toBe('Low-bar squat · back-off');
    expect(monday.slots.filter((slot) => slot.role !== 'T1').every((slot) => slot.sets.length === 2)).toBe(
      true,
    );
    expect(getMesocycleContext('2026-11-02').freezeProgression).toBe(false);
  });

  it('C2 week of 9 Nov is frozen, accessories stay dropped, and deadlift is Wednesday', () => {
    expect(getMesocycleContext('2026-11-09').freezeProgression).toBe(true);
    expect(labels('2026-11-09', 'A')).toEqual(['70 kg × 1 then 60 kg × 2 × 2']);
    expect(labels('2026-11-10', 'B')).toEqual(['50 kg × 1 then 42.5 kg × 2 × 2']);
    expect(labels('2026-11-11', 'C')).toEqual(['90 kg × 1 then 77.5 kg × 1 × 2']);
    expect(dayTemplateForDate('C', '2026-11-11').slots[0]?.note).toMatch(/early in the week/);
    expect(labels('2026-11-13', 'D')).toEqual(['40 kg · 2 × 2']);
    expect(dayTemplateForDate('A', '2026-11-09').slots).toHaveLength(1);
    expect(calendarTemplateDay('2026-11-11')).toBe('C');
    expect(calendarTemplateDay('2026-11-12')).toBe('rest');
    expect(defaultTemplateDayForDate('2026-11-11')).toBe('C');
  });
});

describe('Block B hold rule', () => {
  const hard = loggedTop('A', '2026-10-05', 9);
  const borderline = loggedTop('A', '2026-10-05', HOLD_RPE_ABOVE);
  const comfortable = loggedTop('A', '2026-10-05', 8);

  it('holds the previous week when the top set is above RPE 8.5', () => {
    const today = plannedDayPreview(DAY_TEMPLATES.A, [hard], '2026-10-12');
    expect(today[0]?.workLabel).toBe('60 kg · 3 × 4');
    expect(today[0]?.note).toBe('Held: last top set RPE 9');
    expect(today[1]?.workLabel).toBe('55 kg · 3 × 5');
    expect(today[1]?.note).toBe('Back-off.');
    expect(today.find((row) => row.name === 'Paused conventional deadlift')?.workLabel).toBe('60 kg · 3 × 3');
    expect(today.find((row) => row.name === 'RDL')).toBeUndefined();
    const draft = createDraftSession('A', '2026-10-12', [hard]);
    expect(draft.lifts[0]?.sets.filter((set) => !set.warmup).map((set) => set.weight_kg)).toEqual([
      60, 60, 60,
    ]);
  });

  it('does not hold at RPE 8.5 or below, or when nothing was logged', () => {
    expect(plannedDayPreview(DAY_TEMPLATES.A, [borderline], '2026-10-12')[0]?.workLabel).toBe(
      '62.5 kg · 3 × 3',
    );
    expect(plannedDayPreview(DAY_TEMPLATES.A, [comfortable], '2026-10-12')[0]?.workLabel).toBe(
      '62.5 kg · 3 × 3',
    );
    expect(plannedDayPreview(DAY_TEMPLATES.A, [], '2026-10-12')[0]?.workLabel).toBe('62.5 kg · 3 × 3');
    expect(plannedDayPreview(DAY_TEMPLATES.A, [], '2026-10-12')[0]?.note).toBeNull();
  });

  it('keeps the Block preview on the planned step even when Today would hold', () => {
    const week = buildBlockPreview('2026-10-12', [hard]).find((row) => row.id === 'B-2');
    expect(week?.sessions[0]?.exercises[0]?.workLabel).toBe('62.5 kg · 3 × 3');
    expect(week?.sessions[0]?.exercises[0]?.note ?? '').not.toMatch(/Held/);
  });

  it('does not undo the B4 deload when the previous top set was heavy', () => {
    const heavyB3 = loggedTop('A', '2026-10-19', 9);
    expect(plannedDayPreview(DAY_TEMPLATES.A, [heavyB3], '2026-10-26')[0]?.workLabel).toBe(
      '47.5 kg · 2 × 4',
    );
    expect(plannedDayPreview(DAY_TEMPLATES.A, [heavyB3], '2026-10-26')[0]?.note).toBe('Deload. RPE 5–6.');
  });

  it('ignores the hold on frozen C2 and test week', () => {
    const heavyC1 = loggedTop('A', '2026-11-02', 9);
    const c2 = plannedDayPreview(DAY_TEMPLATES.A, [heavyC1], '2026-11-09');
    expect(c2[0]?.workLabel).toBe('70 kg × 1 then 60 kg × 2 × 2');
    expect(c2[0]?.note).toBe('Frozen.');

    const heavyOpener = loggedTop('A', '2026-11-16', 9);
    const testWeek = dayTemplateForDate('A', '2026-11-17', { logs: [heavyOpener], hold: true });
    expect(testWeek.title).toBe('Deadlift + bench');
    expect(testWeek.slots.map((slot) => slot.sets.map((set) => set.weight_kg))).toEqual([
      [65, 65],
      [40, 40],
    ]);
    expect(getMesocycleContext('2026-11-16').freezeProgression).toBe(true);
    expect(getMesocycleContext('2026-11-16').phase).toBe('peak_taper');
  });

  it('treats a heavier or tighter plan as a step up and a lighter plan as not', () => {
    const b1 = t1PrescriptionFor('A', '2026-10-05');
    const b2 = t1PrescriptionFor('A', '2026-10-12');
    const b4 = t1PrescriptionFor('A', '2026-10-26');
    const d1 = t1PrescriptionFor('D', '2026-10-09');
    const d2 = t1PrescriptionFor('D', '2026-10-16');
    expect(b1 && b2 && isStepUp(b2, b1)).toBe(true);
    expect(b2 && b4 && isStepUp(b4, b2)).toBe(false);
    expect(d1 && d2 && isStepUp(d2, d1)).toBe(true);
    expect(
      shouldApplyHold({ frozen: true, block: 'B', steppingUp: true, topRpe: 9 }),
    ).toBe(false);
    expect(
      shouldApplyHold({ frozen: false, block: 'C', steppingUp: true, topRpe: 9 }),
    ).toBe(false);
    expect(
      shouldApplyHold({ frozen: false, block: 'B', steppingUp: true, topRpe: 9 }),
    ).toBe(true);
  });
});

describe('Block B volume rows', () => {
  it('B1–B3 add back-offs, a paused Day C bench, three Day D sets, and one extra accessory set', () => {
    expect(labels('2026-10-05', 'A').slice(0, 3)).toEqual([
      '60 kg · 3 × 4',
      '55 kg · 3 × 5',
      '60 kg · 3 × 3',
    ]);
    expect(labels('2026-10-06', 'B').slice(0, 2)).toEqual(['42.5 kg · 3 × 5', '37.5 kg · 3 × 6']);
    expect(labels('2026-10-08', 'C').slice(0, 3)).toEqual([
      '77.5 kg · 3 × 3',
      '67.5 kg · 2 × 5',
      '35 kg · 3 × 6',
    ]);
    expect(labels('2026-10-09', 'D')[0]).toBe('42.5 kg · 3 × 5');

    expect(labels('2026-10-12', 'A')[1]).toBe('55 kg · 3 × 5');
    expect(labels('2026-10-19', 'A')[1]).toBe('55 kg · 2 × 5');
    expect(labels('2026-10-20', 'B')[1]).toBe('37.5 kg · 2 × 6');
    expect(labels('2026-10-22', 'C')[1]).toBe('67.5 kg · 2 × 5');
    expect(labels('2026-10-23', 'D')[0]).toBe('42.5 kg · 3 × 3');

    const monday = dayTemplateForDate('A', '2026-10-05');
    const backoff = monday.slots[1];
    expect(backoff?.sets.map((set) => set.part_label)).toEqual(['B1', 'B2', 'B3']);
    expect(backoff?.skipWarmup).toBe(true);
    expect(monday.slots[2]?.exercise_id).toBe('deadlift_paused');
    expect(monday.slots[2]?.sets).toHaveLength(3);
    expect(monday.slots[2]?.sets.every((set) => set.weight_kg === 60 && set.reps === 3)).toBe(true);
    expect(monday.slots.some((slot) => slot.exercise_id === 'rdl')).toBe(false);
    const friday = dayTemplateForDate('D', '2026-10-09');
    expect(friday.slots.find((slot) => slot.slot_id === 'd-curl')?.sets).toHaveLength(3);
    expect(friday.slots.find((slot) => slot.slot_id === 'd-hinge')?.sets).toEqual([
      expect.objectContaining({ weight_kg: 50, reps: 8, rpe: 7 }),
      expect.objectContaining({ weight_kg: 50, reps: 8, rpe: 7 }),
      expect.objectContaining({ weight_kg: 50, reps: 8, rpe: 7 }),
      expect.objectContaining({ weight_kg: 50, reps: 8, rpe: 7 }),
    ]);
    expect(friday.slots.find((slot) => slot.slot_id === 'd-close-grip')?.sets).toEqual([
      expect.objectContaining({ weight_kg: 40, reps: 8, rpe: 7 }),
      expect.objectContaining({ weight_kg: 40, reps: 8, rpe: 7 }),
      expect.objectContaining({ weight_kg: 40, reps: 8, rpe: 7 }),
    ]);
    expect(friday.slots.some((slot) => slot.exercise_id === 'cable_rope_pushdown')).toBe(false);

    const deadlift = dayTemplateForDate('C', '2026-10-08');
    expect(deadlift.slots[2]?.displayName).toBe('Bench press · paused');
    expect(deadlift.slots[2]?.sets.map((set) => set.rpe_label)).toEqual(['6–7', '6–7', '6–7']);
    const draft = createDraftSession('C', '2026-10-08');
    expect(draft.lifts[1]?.name).toBe('Conventional deadlift · back-off');
    expect(draft.lifts[1]?.sets.some((set) => set.warmup)).toBe(false);
    expect(draft.lifts[2]?.name).toBe('Bench press · paused');
    expect(draft.lifts[0]?.sets.some((set) => set.warmup)).toBe(true);
  });

  it('B4 drops back-offs and the Day C bench, and keeps two accessory sets', () => {
    const squat = labels('2026-10-26', 'A');
    expect(squat[0]).toBe('47.5 kg · 2 × 4');
    expect(squat.some((row) => row.startsWith('55 kg'))).toBe(false);
    expect(dayTemplateForDate('A', '2026-10-26').slots[1]?.sets).toHaveLength(2);
    const deadlift = dayTemplateForDate('C', '2026-10-29');
    expect(deadlift.slots.map((slot) => slot.displayName ?? slot.exercise_id)).not.toContain(
      'Bench press · paused',
    );
    expect(deadlift.slots.some((slot) => slot.volumeKind === 'backoff')).toBe(false);
    expect(deadlift.slots.filter((slot) => slot.role !== 'T1').every((slot) => slot.sets.length === 2)).toBe(
      true,
    );
  });

  it('holds the top sets and leaves that week’s back-off on the listed load', () => {
    const heavy = loggedTop('A', '2026-10-12', 9);
    const today = plannedDayPreview(DAY_TEMPLATES.A, [heavy], '2026-10-19');
    expect(today[0]?.workLabel).toBe('62.5 kg · 3 × 3');
    expect(today[0]?.note).toBe('Held: last top set RPE 9');
    expect(today[1]?.workLabel).toBe('55 kg · 2 × 5');
    expect(today[1]?.note).toBe('Back-off.');
  });

  it('leaves C2 and the test week without the extra rows', () => {
    const c2 = dayTemplateForDate('A', '2026-11-09');
    expect(c2.slots).toHaveLength(1);
    expect(c2.slots[0]?.volumeKind).toBeUndefined();
    const opener = dayTemplateForDate('A', '2026-11-16');
    expect(opener.slots.map((slot) => slot.exercise_id)).toEqual(['squat_low_bar', 'bench_regular']);
    expect(opener.slots.some((slot) => slot.volumeKind)).toBe(false);
    const pull = dayTemplateForDate('C', '2026-11-17');
    expect(pull.slots.map((slot) => slot.displayName ?? slot.slot_id)).toEqual(['tw-dl', 'tw-bench-2']);
  });
});

describe('Fri 20 Nov test week', () => {
  it('opens Monday, pulls Tuesday, rests Wednesday and Thursday, and tests Friday', () => {
    expect(testWeekRole('2026-11-16')).toBe('opener');
    expect(testWeekRole('2026-11-17')).toBe('pull');
    expect(testWeekRole('2026-11-18')).toBe('rest');
    expect(testWeekRole('2026-11-19')).toBe('rest');
    expect(testWeekRole('2026-11-20')).toBe('test');
    expect(testWeekRole('2026-11-21')).toBeNull();
    expect(calendarTemplateDay('2026-11-17')).toBe('C');
    expect(calendarTemplateDay('2026-11-18')).toBe('rest');
    expect(defaultTemplateDayForDate('2026-11-16')).toBe('A');
    expect(labels('2026-11-16', 'B')).toEqual(['52.5 kg · 2 × 2', '37.5 kg · 2 × 2']);
    expect(labels('2026-11-17', 'A')).toEqual(['65 kg · 2 × 2', '40 kg · 2 × 1']);
    expect(dayTemplateForDate('A', '2026-11-20').slots.map((slot) => slot.plan_label)).toEqual([
      'Planned · 70 / 75 / 77.5–80 kg',
      'Planned · 50 / 52.5 / 55–57.5 kg',
      'Planned · 87.5 / 92.5–95 / 97.5–100 kg',
    ]);
    expect(getMesocycleContext('2026-11-20').isTestDay).toBe(true);
    const week = buildBlockPreview('2026-11-16', [])[0];
    expect(week?.sessions.map((session) => `${session.date} ${session.heading}`)).toEqual([
      '2026-11-16 Mon 16 Nov · Squat + bench',
      '2026-11-17 Tue 17 Nov · Deadlift + bench',
      '2026-11-20 Fri 20 Nov · 1RM test',
    ]);
    expect(week?.sessions[1]?.exercises.map((row) => row.workLabel)).toEqual([
      '65 kg · 2 × 2',
      '40 kg · 2 × 1',
    ]);
    expect(week?.sessions[2]?.exercises[0]?.workLabel).toBe('Planned · 70 / 75 / 77.5–80 kg');
  });
});

describe('Block B main-lift variations', () => {
  const pauseCue = '2 s pause just below the knee. RPE 6–7.';

  function pausedRow(date: string, logs: SessionLog[] = []) {
    return plannedDayPreview(DAY_TEMPLATES.A, logs, date).find(
      (row) => row.exercise_id === 'deadlift_paused',
    );
  }

  function closeGripRow(date: string, logs: SessionLog[] = []) {
    return plannedDayPreview(DAY_TEMPLATES.D, logs, date).find(
      (row) => row.exercise_id === 'bench_close_grip',
    );
  }

  it('puts the paused deadlift on Day A and the RDL plus close-grip on Day D for B1–B3', () => {
    for (const date of ['2026-10-05', '2026-10-12', '2026-10-19']) {
      const monday = dayTemplateForDate('A', date);
      const paused = monday.slots.find((slot) => slot.slot_id === 'a-paused-dl');
      expect(paused?.sets.map((set) => set.weight_kg)).toEqual([60, 60, 60]);
      expect(paused?.sets.map((set) => set.rpe_label)).toEqual(['6–7', '6–7', '6–7']);
      expect(paused?.note).toBe(pauseCue);
      expect(monday.slots.some((slot) => slot.exercise_id === 'rdl')).toBe(false);
    }
    for (const date of ['2026-10-09', '2026-10-16', '2026-10-23']) {
      const friday = dayTemplateForDate('D', date);
      const rdl = friday.slots.find((slot) => slot.slot_id === 'd-hinge');
      const close = friday.slots.find((slot) => slot.slot_id === 'd-close-grip');
      const squat = friday.slots.find((slot) => slot.slot_id === 'd-squat');
      expect(friday.slots.map((slot) => slot.slot_id).slice(0, 2)).toEqual(['d-t1', 'd-hinge']);
      expect(rdl?.sets.map((set) => [set.weight_kg, set.reps, set.rpe])).toEqual([
        [50, 8, 7],
        [50, 8, 7],
        [50, 8, 7],
        [50, 8, 7],
      ]);
      expect(close?.optional).toBeFalsy();
      expect(close?.sets.map((set) => [set.weight_kg, set.reps, set.rpe])).toEqual([
        [40, 8, 7],
        [40, 8, 7],
        [40, 8, 7],
      ]);
      expect(squat?.sets.map((set) => set.weight_kg)).toEqual([30, 30, 30, 30]);
      expect(squat?.alternatives).toContain('squat_low_bar_paused');
      expect(friday.slots.some((slot) => slot.slot_id === 'd-tri')).toBe(false);
    }
    const thursday = dayTemplateForDate('C', '2026-10-08');
    expect(thursday.slots.find((slot) => slot.slot_id === 'c-paused-bench')?.sets.map((set) => set.weight_kg)).toEqual([
      35, 35, 35,
    ]);
    expect(thursday.slots.find((slot) => slot.slot_id === 'c-hinge')?.exercise_id).toBe('rdl');
    expect(thursday.slots.some((slot) => slot.alternatives.includes('squat_low_bar_paused'))).toBe(false);
  });

  it('steps the paused deadlift by 2.5 kg when every logged work set is RPE 7 or lower', () => {
    const easy = loggedVariation('A', '2026-10-05', 'deadlift_paused', [6, 6.5, 7]);
    expect(pausedRow('2026-10-12', [easy])).toMatchObject({
      workLabel: '62.5 kg · 3 × 3',
      note: '+2.5 kg: last RPE 7',
    });
    const both = [
      easy,
      loggedVariation('A', '2026-10-12', 'deadlift_paused', [6, 6, 6.5]),
    ];
    expect(pausedRow('2026-10-19', both)).toMatchObject({
      workLabel: '65 kg · 3 × 3',
      note: '+2.5 kg: last RPE 6.5',
    });
    const draft = createDraftSession('A', '2026-10-12', [easy]);
    expect(
      draft.lifts
        .find((lift) => lift.exercise_id === 'deadlift_paused')
        ?.sets.filter((set) => !set.warmup)
        .map((set) => set.weight_kg),
    ).toEqual([62.5, 62.5, 62.5]);
  });

  it('holds the paused deadlift when any work set is above RPE 7, and keeps the load when nothing was logged', () => {
    const hard = loggedVariation('A', '2026-10-05', 'deadlift_paused', [6, 8, 6.5]);
    expect(pausedRow('2026-10-12', [hard])).toMatchObject({
      workLabel: '60 kg · 3 × 3',
      note: 'Held: RPE 8',
    });
    expect(pausedRow('2026-10-12', [])?.workLabel).toBe('60 kg · 3 × 3');
    expect(pausedRow('2026-10-12', [])?.note).toBe(pauseCue);

    const stepped = loggedVariation('A', '2026-10-05', 'deadlift_paused', [7, 7, 7]);
    expect(pausedRow('2026-10-19', [stepped])).toMatchObject({
      workLabel: '62.5 kg · 3 × 3',
      note: pauseCue,
    });
  });

  it('leaves B2 and B3 block preview on the base paused-deadlift load', () => {
    const easy = loggedVariation('A', '2026-10-05', 'deadlift_paused', [6, 6, 6]);
    const week = buildBlockPreview('2026-10-12', [easy]).find((row) => row.id === 'B-2');
    expect(week?.sessions[0]?.exercises.find((row) => row.name === 'Paused conventional deadlift')).toMatchObject({
      workLabel: '60 kg · 3 × 3',
      note: pauseCue,
    });
  });

  it('steps close-grip bench by 2.5 kg when a logged set is below RPE 6, and holds at RPE 6', () => {
    const easy = loggedVariation('D', '2026-10-09', 'bench_close_grip', [7, 7, 5.5]);
    expect(closeGripRow('2026-10-16', [easy])).toMatchObject({
      workLabel: '42.5 kg · 3 × 8',
      note: '+2.5 kg: last RPE 5.5',
    });
    const earlyOnly = loggedVariation('D', '2026-10-09', 'bench_close_grip', [5, 7, 7]);
    expect(closeGripRow('2026-10-16', [earlyOnly])).toMatchObject({
      workLabel: '42.5 kg · 3 × 8',
      note: '+2.5 kg: last RPE 5',
    });
    const atSix = loggedVariation('D', '2026-10-09', 'bench_close_grip', [6, 6, 6]);
    expect(closeGripRow('2026-10-16', [atSix])).toMatchObject({
      workLabel: '40 kg · 3 × 8',
      note: 'Held: last RPE 6',
    });
    expect(closeGripRow('2026-10-16', [])?.note).toBeNull();
    const carried = [
      easy,
      loggedVariation('D', '2026-10-16', 'bench_close_grip', [7, 6, 6]),
    ];
    expect(closeGripRow('2026-10-23', carried)).toMatchObject({
      workLabel: '42.5 kg · 3 × 8',
      note: 'Held: last RPE 6',
    });
  });

  it('does not apply the variations on B4, C1, C2, or test week', () => {
    const b4 = dayTemplateForDate('A', '2026-10-26', { hold: true, logs: [
      loggedVariation('A', '2026-10-19', 'deadlift_paused', [6, 6, 6]),
    ] });
    expect(b4.slots.some((slot) => slot.exercise_id === 'deadlift_paused')).toBe(false);
    expect(b4.slots.find((slot) => slot.slot_id === 'a-hinge')?.sets).toHaveLength(2);
    expect(dayTemplateForDate('D', '2026-10-30').slots.some((slot) => slot.exercise_id === 'bench_close_grip')).toBe(
      false,
    );
    expect(dayTemplateForDate('D', '2026-10-30').slots.find((slot) => slot.slot_id === 'd-tri')?.sets).toHaveLength(2);
    expect(
      dayTemplateForDate('D', '2026-10-30').slots.find((slot) => slot.slot_id === 'd-squat')?.alternatives,
    ).not.toContain('squat_low_bar_paused');

    const c1 = dayTemplateForDate('A', '2026-11-02');
    expect(c1.slots.find((slot) => slot.slot_id === 'a-hinge')?.sets.map((set) => [set.weight_kg, set.reps])).toEqual([
      [50, 8],
      [50, 8],
    ]);
    expect(c1.slots.some((slot) => slot.exercise_id === 'deadlift_paused')).toBe(false);
    const c1Deadlift = dayTemplateForDate('C', '2026-11-05');
    expect(c1Deadlift.slots.find((slot) => slot.slot_id === 'c-hinge')?.sets).toHaveLength(2);
    expect(c1Deadlift.slots.find((slot) => slot.slot_id === 'c-paused-bench')?.sets).toHaveLength(2);
    expect(dayTemplateForDate('D', '2026-11-06').slots.some((slot) => slot.exercise_id === 'rdl')).toBe(false);
    expect(dayTemplateForDate('D', '2026-11-06').slots.some((slot) => slot.exercise_id === 'bench_close_grip')).toBe(
      false,
    );

    expect(dayTemplateForDate('A', '2026-11-09').slots.map((slot) => slot.exercise_id)).toEqual(['squat_low_bar']);
    expect(dayTemplateForDate('A', '2026-11-16').slots.map((slot) => slot.exercise_id)).toEqual([
      'squat_low_bar',
      'bench_regular',
    ]);
    expect(dayTemplateForDate('A', '2026-11-20').slots.map((slot) => slot.exercise_id)).toEqual([
      'squat_low_bar',
      'bench_regular',
      'deadlift_conventional',
    ]);
  });
});
