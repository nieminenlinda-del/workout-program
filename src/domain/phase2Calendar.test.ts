import { describe, expect, it } from 'vitest';
import { getMesocycleContext } from './phase2Calendar';
import {
  Phase2NotImplementedError,
  SEED_TRAINING_MAXES,
  TEST_DAY,
  TEST_LIFT_ORDER,
  progressionEngineStub,
} from '../types/phase2';

describe('phase 2 calendar hook', () => {
  it('maps accumulate / intensify / peak windows', () => {
    expect(getMesocycleContext('2026-09-08')).toMatchObject({
      block: 'A',
      phase: 'accumulate',
      freezeProgression: false,
    });
    expect(getMesocycleContext('2026-10-20')).toMatchObject({
      block: 'B',
      phase: 'intensify',
    });
    expect(getMesocycleContext('2026-11-10')).toMatchObject({
      block: 'C',
      phase: 'peak_overreach',
      freezeProgression: false,
    });
  });

  it('freezes on peak taper and test day, squat then bench then deadlift', () => {
    expect(getMesocycleContext('2026-11-18').freezeProgression).toBe(true);
    expect(getMesocycleContext('2026-11-18').phase).toBe('peak_taper');
    const test = getMesocycleContext(TEST_DAY);
    expect(test).toMatchObject({
      isTestDay: true,
      phase: 'test',
      freezeProgression: true,
    });
    expect([...test.testLiftOrder]).toEqual([...TEST_LIFT_ORDER]);
    expect(SEED_TRAINING_MAXES).toEqual({ squat_kg: 67.5, bench_kg: 50, deadlift_kg: 85 });
  });

  it('does not implement the progression engine', () => {
    expect(() =>
      progressionEngineStub.proposeNext({
        logs: [],
        trainingMaxes: SEED_TRAINING_MAXES,
        asOf: '2026-09-03',
      }),
    ).toThrow(Phase2NotImplementedError);
  });
});
