import { describe, expect, it } from 'vitest';
import { getMesocycleContext, resolveTrainingMode } from './phase2Calendar';
import {
  CURRENT_CYCLE,
  HYPERTROPHY_PROGRESSION_HOOK,
  MESOCYCLE_WINDOWS,
  Phase2NotImplementedError,
  SEED_TRAINING_MAXES,
  STRENGTH_PEAK_PROGRESSION_HOOK,
  TARGET_TEST_DATE,
  TEST_DAY,
  TEST_LIFT_ORDER,
  programModeFrom,
  progressionEngineStub,
  progressionRulesFor,
} from '../types/phase2';

describe('phase 2 calendar hook', () => {
  it('is strength_peak from day one of this cycle while the 2026-11-21 test date is set', () => {
    expect(getMesocycleContext('2026-09-06').training_mode).toBe('strength_peak');
    expect(getMesocycleContext('2026-09-06').block).toBeNull();
    expect(getMesocycleContext('2026-09-07').training_mode).toBe('strength_peak');
    expect(getMesocycleContext('2026-09-07').phase).toBe('accumulate');
    expect(getMesocycleContext('2026-09-07').block).toBe('A');
    expect(getMesocycleContext('2026-10-04').phase).toBe('accumulate');
    expect(getMesocycleContext('2026-10-05').phase).toBe('intensify');
    expect(getMesocycleContext('2026-10-05').block).toBe('B');
    expect(getMesocycleContext('2026-11-01').phase).toBe('intensify');
    expect(getMesocycleContext('2026-11-02').phase).toBe('peak_overreach');
    expect(getMesocycleContext('2026-11-02').block).toBe('C');
    expect(getMesocycleContext('2026-10-20').training_mode).toBe('strength_peak');
    expect(getMesocycleContext('2026-11-10').training_mode).toBe('strength_peak');
    expect(getMesocycleContext(TARGET_TEST_DATE).training_mode).toBe('strength_peak');
    expect(resolveTrainingMode('2026-09-07', 'accumulate', TARGET_TEST_DATE)).toBe('strength_peak');
    expect(resolveTrainingMode('2026-09-07', null, null)).toBe('hypertrophy');
    expect(CURRENT_CYCLE).toEqual({
      target_test_date: '2026-11-21',
      peak_training_mode: 'strength_peak',
      post_test_training_mode: 'hypertrophy',
    });
  });

  it('uses Kraft’s contiguous 2026 windows: A 7 Sep–4 Oct, B next day, C through test day', () => {
    expect(MESOCYCLE_WINDOWS.map((w) => [w.block, w.start, w.end])).toEqual([
      ['A', '2026-09-07', '2026-10-04'],
      ['B', '2026-10-05', '2026-11-01'],
      ['C', '2026-11-02', '2026-11-21'],
    ]);
    expect(SEED_TRAINING_MAXES).toEqual({ squat_kg: 72.5, bench_kg: 52.5, deadlift_kg: 90 });
  });

  it('freezes on peak taper and test day, squat then bench then deadlift', () => {
    expect(getMesocycleContext('2026-11-18').freezeProgression).toBe(true);
    expect(getMesocycleContext('2026-11-18').phase).toBe('peak_taper');
    expect(getMesocycleContext('2026-11-18').training_mode).toBe('strength_peak');
    const test = getMesocycleContext(TEST_DAY);
    expect(test).toMatchObject({
      isTestDay: true,
      phase: 'test',
      freezeProgression: true,
      training_mode: 'strength_peak',
      target_test_date: TARGET_TEST_DATE,
    });
    expect([...test.testLiftOrder]).toEqual([...TEST_LIFT_ORDER]);
    expect(SEED_TRAINING_MAXES).toEqual({ squat_kg: 72.5, bench_kg: 52.5, deadlift_kg: 90 });
  });

  it('returns to hypertrophy after the test unless a next test is set', () => {
    expect(getMesocycleContext('2026-11-22').training_mode).toBe('hypertrophy');
    expect(resolveTrainingMode('2026-11-22', 'test', TARGET_TEST_DATE)).toBe('hypertrophy');
    expect(resolveTrainingMode('2026-11-22', 'test', '2026-12-15')).toBe('strength_peak');
  });

  it('keeps PowerCombo progression hooks documented and unimplemented', () => {
    expect(STRENGTH_PEAK_PROGRESSION_HOOK).toEqual({
      t1_load_increment_kg: 2.5,
      optional_amrap: true,
      tm_bump_pct_after_green_block: 2.5,
      freeze_on: ['peak_taper', 'test'],
    });
    expect(HYPERTROPHY_PROGRESSION_HOOK).toEqual({
      progress: 'reps_before_load',
      hypertrophy_rep_range: [6, 12],
      tm_recalc_every_weeks: [8, 12],
      tm_recalc_after_test: true,
      deload_every_weeks: [4, 6],
    });
    expect(progressionRulesFor('strength_peak').rules).toBe(STRENGTH_PEAK_PROGRESSION_HOOK);
    expect(progressionRulesFor('hypertrophy').rules).toBe(HYPERTROPHY_PROGRESSION_HOOK);
    expect(programModeFrom('strength_peak')).toBe('peak');
    expect(getMesocycleContext('2026-11-21').program_mode).toBe('peak');
    expect(() =>
      progressionEngineStub.proposeNext({
        logs: [],
        trainingMaxes: SEED_TRAINING_MAXES,
        asOf: '2026-09-03',
        program_mode: 'hypertrophy',
        training_mode: 'hypertrophy',
        target_test_date: TARGET_TEST_DATE,
      }),
    ).toThrow(Phase2NotImplementedError);
  });
});
