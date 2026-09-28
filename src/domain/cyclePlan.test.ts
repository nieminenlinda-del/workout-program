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
    expect(workKg('2026-10-09', 'D')).toEqual([42.5, 42.5]);
    expect(t1PrescriptionFor('D', '2026-10-09')?.reps).toBe(5);
    expect(dayTemplateForDate('A', '2026-10-05').slots.length).toBe(DAY_TEMPLATES.A.slots.length);
  });

  it('B2 week of 12 Oct', () => {
    expect(t1PrescriptionFor('A', '2026-10-12')).toMatchObject({ weight_kg: 62.5, set_count: 3, reps: 3 });
    expect(t1PrescriptionFor('B', '2026-10-13')).toMatchObject({ weight_kg: 45, set_count: 3, reps: 3 });
    expect(t1PrescriptionFor('C', '2026-10-15')).toMatchObject({ weight_kg: 80, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('D', '2026-10-16')).toMatchObject({ weight_kg: 42.5, set_count: 2, reps: 4 });
  });

  it('B3 week of 19 Oct', () => {
    expect(t1PrescriptionFor('A', '2026-10-19')).toMatchObject({ weight_kg: 65, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('B', '2026-10-20')).toMatchObject({ weight_kg: 47.5, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('C', '2026-10-22')).toMatchObject({ weight_kg: 82.5, set_count: 3, reps: 2 });
    expect(t1PrescriptionFor('D', '2026-10-23')).toMatchObject({ weight_kg: 42.5, set_count: 2, reps: 3 });
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

  it('C1 week of 2 Nov is capped top plus backoff and drops accessories', () => {
    expect(labels('2026-11-02', 'A')).toEqual(['67.5 kg × 1 then 60 kg × 2 × 2']);
    expect(labels('2026-11-03', 'B')).toEqual(['47.5 kg × 1 then 42.5 kg × 2 × 2']);
    expect(labels('2026-11-05', 'C')).toEqual(['87.5 kg × 1 then 77.5 kg × 2 × 2']);
    expect(labels('2026-11-06', 'D')).toEqual(['40 kg · 2 × 3']);
    const monday = dayTemplateForDate('A', '2026-11-02');
    expect(monday.slots.map((slot) => slot.role)).toEqual(['T1']);
    expect(monday.slots[0]?.sets.map((set) => set.part_label)).toEqual(['Top', 'B1', 'B2']);
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
    expect(today[1]?.workLabel).toBe('50 kg · 3 × 8');
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
