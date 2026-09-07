import { describe, expect, it } from 'vitest';
import {
  formatPlanLoad,
  formatLoggedLoad,
  loggedDiffersFromPlan,
  prescriptionReps,
  prescriptionWeightKg,
  withPrescription,
} from './setPrescription';
import type { LoggedSet } from '../types/session';

const plan: LoggedSet = {
  weight_kg: 47.5,
  reps: 5,
  rpe: 7,
  completed: false,
  target_weight_kg: 47.5,
  target_reps: 5,
};

describe('set prescription', () => {
  it('falls back to working kg/reps when older drafts omit targets', () => {
    const legacy = { weight_kg: 50, reps: 5 };
    expect(prescriptionWeightKg(legacy)).toBe(50);
    expect(prescriptionReps(legacy)).toBe(5);
    expect(withPrescription(legacy)).toMatchObject({
      target_weight_kg: 50,
      target_reps: 5,
    });
  });

  it('formats unfinished rows from the stored plan, including AMRAP', () => {
    expect(formatPlanLoad(plan)).toBe('47.5 kg × 5');
    expect(formatPlanLoad({ ...plan, weight_kg: 42.5, amrap: true, target_weight_kg: 50 })).toBe(
      '50 kg × 5+',
    );
    expect(
      formatPlanLoad({ weight_kg: 0, reps: 30, target_weight_kg: 0, target_reps: 30 }, true),
    ).toBe('BW × 30s');
    expect(formatLoggedLoad({ weight_kg: 0, reps: 60, amrap: false }, true)).toBe('BW × 60s');
  });

  it('flags a logged set only when actual kg/reps left the plan', () => {
    const logged: LoggedSet = { ...plan, completed: true };
    expect(loggedDiffersFromPlan(logged)).toBe(false);
    expect(loggedDiffersFromPlan({ ...logged, weight_kg: 45 })).toBe(true);
    expect(loggedDiffersFromPlan({ ...plan, completed: false, weight_kg: 40 })).toBe(false);
  });
});
