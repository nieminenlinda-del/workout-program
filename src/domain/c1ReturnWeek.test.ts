import { describe, expect, it } from 'vitest';
import { createDraftSession } from './sessionFactory';
import { dayTemplateForDate, isC1ReturnWeek, t1PrescriptionFor } from './programWeek';
import { C1_RETURN_RULE } from './c1ReturnWeek';
import { eligibleEstimates } from './dashboard';
import { testWeekRole } from './testWeek';

describe('Block C week 1 return', () => {
  it('replaces only C1 and leaves C2 on the frozen peak table', () => {
    expect(isC1ReturnWeek('2026-11-02')).toBe(true);
    expect(isC1ReturnWeek('2026-11-08')).toBe(true);
    expect(isC1ReturnWeek('2026-11-01')).toBe(false);
    expect(isC1ReturnWeek('2026-11-09')).toBe(false);
    expect(t1PrescriptionFor('A', '2026-11-02')).toBeNull();
    expect(t1PrescriptionFor('A', '2026-11-09')?.weight_kg).toBe(70);

    const thursday = dayTemplateForDate('C', '2026-11-05');
    expect(thursday.slots.map((slot) => slot.exercise_id)).toEqual([
      'deadlift_conventional',
      'deadlift_conventional',
      'bench_regular',
      'glute_bridge',
      'dead_bug',
    ]);
    expect(thursday.slots[1]?.optional).toBe(true);
    expect(thursday.slots[0]?.note).toMatch(/3 s up/);
    expect(dayTemplateForDate('C', '2026-11-11').slots).toHaveLength(1);
    expect(dayTemplateForDate('A', '2026-11-16').title).toBe('Squat + bench');
  });

  it('does not let a C1 log move training maxes', () => {
    const draft = createDraftSession('A', '2026-11-02');
    expect(draft.counts_toward_tm).toBe(false);
    draft.status = 'complete';
    for (const set of draft.lifts[0]?.sets ?? []) {
      if (!set.warmup) {
        set.completed = true;
        set.rpe = 8;
      }
    }
    expect(eligibleEstimates([draft], 'squat')).toEqual([]);
    expect(createDraftSession('A', '2026-11-09').counts_toward_tm).toBeUndefined();
  });

  it('keeps the bench 1RM and excludes the technique singles', () => {
    expect(testWeekRole('2026-11-20')).toBe('test');
    expect(testWeekRole('2026-11-21')).toBeNull();
    const draft = createDraftSession('A', '2026-11-20');
    expect(draft.counts_toward_tm).toBeUndefined();
    expect(draft.lifts.map((lift) => [lift.name, lift.counts_toward_tm])).toEqual([
      ['Squat technique single', false],
      ['Bench press', undefined],
      ['Deadlift technique single', false],
    ]);
    draft.status = 'complete';
    for (const lift of draft.lifts) {
      for (const set of lift.sets) {
        if (!set.warmup) {
          set.completed = true;
          set.rpe = 9;
        }
      }
    }
    expect(eligibleEstimates([draft], 'squat')).toEqual([]);
    expect(eligibleEstimates([draft], 'deadlift')).toEqual([]);
    expect(eligibleEstimates([draft], 'bench').length).toBeGreaterThan(0);
    expect(dayTemplateForDate('A', '2026-11-20').focus).toMatch(/later date/);
  });
});

describe('return rule copy', () => {
  it('uses the pain stop sentence', () => {
    expect(C1_RETURN_RULE).toBe(
      'Stop a lift if pain goes above 2/10 or with any leg symptoms, and switch to supported DB work.',
    );
  });
});
