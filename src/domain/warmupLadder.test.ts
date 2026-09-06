import { describe, expect, it } from 'vitest';
import { warmupKindFor, warmupLadder } from './warmupLadder';

describe('Kraft warmup ladder', () => {
  it('squat W=47.5: 20×5 → 30×5 → 40×3', () => {
    expect(warmupLadder(47.5, 'squat')).toEqual([
      { weight_kg: 20, reps: 5 },
      { weight_kg: 30, reps: 5 },
      { weight_kg: 40, reps: 3 },
    ]);
  });

  it('bench W=35: 20×8 → 25×5 → 30×3', () => {
    expect(warmupLadder(35, 'bench')).toEqual([
      { weight_kg: 20, reps: 8 },
      { weight_kg: 25, reps: 5 },
      { weight_kg: 30, reps: 3 },
    ]);
  });

  it('deadlift W=60: 20×5 → 40×5 → 50×3', () => {
    expect(warmupLadder(60, 'deadlift')).toEqual([
      { weight_kg: 20, reps: 5 },
      { weight_kg: 40, reps: 5 },
      { weight_kg: 50, reps: 3 },
    ]);
  });

  it('skips the bar when W ≤ 25 and never warms up ≥ W', () => {
    expect(warmupLadder(25, 'bench').every((s) => s.weight_kg < 25)).toBe(true);
    expect(warmupLadder(22.5, 'squat').every((s) => s.weight_kg < 22.5)).toBe(true);
  });

  it('maps T1 / Day D bench volume to a warmup kind', () => {
    expect(warmupKindFor('squat_low_bar')).toBe('squat');
    expect(warmupKindFor('bench_regular')).toBe('bench');
    expect(warmupKindFor('bench_regular_volume')).toBe('bench');
    expect(warmupKindFor('deadlift_conventional')).toBe('deadlift');
    expect(warmupKindFor('rdl')).toBeNull();
  });
});
