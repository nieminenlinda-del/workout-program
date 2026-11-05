import { describe, expect, it } from 'vitest';
import { createDraftSession } from './sessionFactory';
import { dayTemplateForDate, isC1ReturnWeek, isC2Week } from './programWeek';
import { C2_MEET_NOTE, C2_STOP_RULE } from './c2Week';
import { calendarTemplateDay } from './templateDay';
import { buildBlockPreview } from './blockPreview';
import { eligibleEstimates } from './dashboard';
import { testWeekRole } from './testWeek';

describe('Block C week 2', () => {
  it('replaces the frozen peak on the training days and rests Wednesday', () => {
    expect(isC2Week('2026-11-09')).toBe(true);
    expect(isC2Week('2026-11-15')).toBe(true);
    expect(isC2Week('2026-11-08')).toBe(false);
    expect(isC2Week('2026-11-16')).toBe(false);
    expect(isC1ReturnWeek('2026-11-09')).toBe(false);
    expect(calendarTemplateDay('2026-11-11')).toBe('rest');
    expect(calendarTemplateDay('2026-11-12')).toBe('C');

    const monday = dayTemplateForDate('A', '2026-11-09');
    expect(monday.slots.map((slot) => [slot.exercise_id, slot.sets.map((set) => [set.weight_kg, set.reps])])).toEqual([
      ['squat_low_bar', [[55, 5], [55, 5], [55, 5]]],
      ['bench_regular', [[47.5, 1], [42.5, 4], [42.5, 4], [42.5, 4]]],
    ]);
    expect(dayTemplateForDate('B', '2026-11-10').slots[0]?.sets.map((set) => [set.weight_kg, set.reps])).toEqual([
      [50, 1],
      [45, 3],
      [45, 3],
      [45, 3],
    ]);
    const thursday = dayTemplateForDate('C', '2026-11-12');
    expect(thursday.slots[0]?.displayName).toBe('Deadlift from the floor');
    expect(thursday.slots[0]?.note).toMatch(/No belt/);
    expect(thursday.slots[0]?.note).toMatch(/side-on/);
    expect(thursday.slots[0]?.sets.map((set) => [set.weight_kg, set.reps])).toEqual([
      [55, 5],
      [55, 5],
      [55, 5],
    ]);
    expect(thursday.slots[1]?.optional).toBe(true);
    expect(thursday.slots[1]?.sets.map((set) => [set.weight_kg, set.reps])).toEqual([
      [60, 3],
      [60, 3],
    ]);
    expect(dayTemplateForDate('D', '2026-11-13').slots.map((slot) => slot.sets.map((set) => set.weight_kg))).toEqual([
      [57.5, 57.5, 57.5],
      [42.5, 42.5, 42.5],
    ]);
    const oldPeak = JSON.stringify(dayTemplateForDate('C', '2026-11-12'));
    expect(oldPeak).not.toContain('90');
    expect(oldPeak).not.toContain('77.5');
  });

  it('does not let a C2 log move training maxes', () => {
    for (const [day, date] of [
      ['A', '2026-11-09'],
      ['B', '2026-11-10'],
      ['C', '2026-11-12'],
      ['D', '2026-11-13'],
    ] as const) {
      const draft = createDraftSession(day, date);
      expect(draft.counts_toward_tm).toBe(false);
      draft.status = 'complete';
      for (const lift of draft.lifts) {
        for (const set of lift.sets) {
          if (!set.warmup) {
            set.completed = true;
            set.rpe = 8;
          }
        }
      }
      expect(eligibleEstimates([draft], 'squat')).toEqual([]);
      expect(eligibleEstimates([draft], 'bench')).toEqual([]);
      expect(eligibleEstimates([draft], 'deadlift')).toEqual([]);
    }
  });

  it('shows the stop rule on C2 and the test-week sessions', () => {
    const week = buildBlockPreview('2026-11-09', []);
    const c2 = week.find((row) => row.id === 'C-2');
    expect(c2?.sessions.map((session) => session.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(c2?.sessions.every((session) => session.notes[0] === C2_STOP_RULE)).toBe(true);
    expect(c2?.sessions.some((session) => session.date === '2026-11-11')).toBe(false);

    const testWeek = buildBlockPreview('2026-11-16', [])[0];
    expect(testWeek?.sessions.map((session) => session.notes[0])).toEqual([
      C2_STOP_RULE,
      C2_STOP_RULE,
      C2_STOP_RULE,
    ]);
    expect(testWeek?.sessions[2]?.notes.join(' ')).toContain(C2_MEET_NOTE);
  });
});

describe('test week loads', () => {
  it('keeps the bench 1RM counting and excludes the technique singles', () => {
    expect(testWeekRole('2026-11-20')).toBe('test');
    expect(testWeekRole('2026-11-21')).toBeNull();
    const monday = createDraftSession('A', '2026-11-16');
    const tuesday = createDraftSession('C', '2026-11-17');
    expect(monday.counts_toward_tm).toBe(false);
    expect(tuesday.counts_toward_tm).toBe(false);
    expect(monday.lifts[0]?.sets.filter((set) => !set.warmup).map((set) => set.weight_kg)).toEqual([55, 55]);

    const test = createDraftSession('A', '2026-11-20');
    expect(test.counts_toward_tm).toBeUndefined();
    expect(test.lifts.map((lift) => [lift.name, lift.counts_toward_tm])).toEqual([
      ['Squat technique single', false],
      ['Bench press', undefined],
      ['Deadlift technique single', false],
    ]);
    expect(test.lifts[0]?.sets.filter((set) => !set.warmup).map((set) => set.weight_kg)).toEqual([65]);
    expect(test.lifts[2]?.sets.filter((set) => !set.warmup).map((set) => set.weight_kg)).toEqual([70]);
    expect(test.lifts[2]?.sets.find((set) => !set.warmup)?.weight_kg).toBe(70);
    test.status = 'complete';
    for (const lift of test.lifts) {
      for (const set of lift.sets) {
        if (!set.warmup) {
          set.completed = true;
          set.rpe = 9;
        }
      }
    }
    expect(eligibleEstimates([test], 'squat')).toEqual([]);
    expect(eligibleEstimates([test], 'deadlift')).toEqual([]);
    expect(eligibleEstimates([test], 'bench').length).toBeGreaterThan(0);
  });
});
