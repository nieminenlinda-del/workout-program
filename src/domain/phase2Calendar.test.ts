import { describe, expect, it } from 'vitest';
import { getMesocycleContext, resolveTrainingMode } from './phase2Calendar';
import {
  HYPERTROPHY_PROGRESSION_HOOK,
  Phase2NotImplementedError,
  SEED_TRAINING_MAXES,
  STRENGTH_PEAK_PROGRESSION_HOOK,
  TARGET_TEST_DATE,
  TEST_DAY,
  TEST_LIFT_ORDER,
  programModeFrom,
  progressionEngineStub,
} from '../types/phase2';

describe('phase 2 calendar hook', () => {
  it('maps accumulate / intensify / peak windows', () => {
    expect(getMesocycleContext('2026-09-08')).toMatchObject({
      block: 'A',
      phase: 'accumulate',
      freezeProgression: false,
      training_mode: 'hypertrophy',
      program_mode: 'hypertrophy',
    });
    expect(getMesocycleContext('2026-10-20')).toMatchObject({
      block: 'B',
      phase: 'intensify',
      training_mode: 'hypertrophy',
    });
    expect(getMesocycleContext('2026-11-10')).toMatchObject({
      block: 'C',
      phase: 'peak_overreach',
      freezeProgression: false,
      training_mode: 'strength_peak',
      program_mode: 'peak',
    });
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
    expect(SEED_TRAINING_MAXES).toEqual({ squat_kg: 67.5, bench_kg: 50, deadlift_kg: 85 });
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
    expect(HYPERTROPHY_PROGRESSION_HOOK.progress).toBe('reps_before_load');
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
