import { describe, expect, it } from 'vitest';
import {
  changeRepCount,
  correctedSummary,
  extraRepCount,
  initialCorrection,
  keptReps,
  toggleExcluded,
} from './correction';
import { attachVbtSet } from './log';
import { detectReps, ramp, type DetectedRep } from './reps';
import { createDraftSession } from '../sessionFactory';
import { sessionVbtCsv } from './csv';

function threeReps(): DetectedRep[] {
  const samples = [
    ...ramp(0, 700, 0.9, 0.3),
    ...ramp(700, 1400, 0.3, 0.9),
    ...ramp(1400, 2200, 0.9, 0.3),
    ...ramp(2200, 3200, 0.3, 0.9),
    ...ramp(3200, 4000, 0.9, 0.3),
    ...ramp(4000, 5500, 0.3, 0.9),
  ];
  return detectReps(samples, { kind: 'squat' });
}

describe('rep correction', () => {
  it('drops a false rep from speed, loss, and the saved count', () => {
    const detected = threeReps();
    expect(detected.length).toBe(3);
    const start = initialCorrection(detected);
    const withoutFirst = toggleExcluded(start, 1);
    expect(withoutFirst.repCount).toBe(2);
    expect(withoutFirst.excluded).toEqual([1]);
    expect(keptReps(withoutFirst).map((rep) => rep.rep)).toEqual([2, 3]);

    const before = correctedSummary(start, 20);
    const after = correctedSummary(withoutFirst, 20);
    expect(after.rep_count).toBe(2);
    expect(after.reps).toHaveLength(2);
    expect(after.best_velocity_m_s).toBeLessThanOrEqual(before.best_velocity_m_s);
    expect(after.velocity_loss_pct).not.toBe(before.velocity_loss_pct);

    const restored = toggleExcluded(withoutFirst, 1);
    expect(restored.excluded).toEqual([]);
    expect(restored.repCount).toBe(3);
    expect(correctedSummary(restored, 20).best_velocity_m_s).toBeCloseTo(before.best_velocity_m_s, 5);
  });

  it('adds count-only reps with + and excludes from the end with −', () => {
    const start = initialCorrection(threeReps());
    const added = changeRepCount(start, 2);
    expect(added.repCount).toBe(5);
    expect(added.excluded).toEqual([]);
    expect(extraRepCount(added)).toBe(2);
    expect(correctedSummary(added, 20).reps).toHaveLength(3);
    expect(correctedSummary(added, 20).rep_count).toBe(5);

    const trimmed = changeRepCount(start, -1);
    expect(trimmed.repCount).toBe(2);
    expect(trimmed.excluded).toEqual([3]);
    expect(keptReps(trimmed).map((rep) => rep.rep)).toEqual([1, 2]);
    expect(changeRepCount(trimmed, -10).repCount).toBe(0);
  });

  it('stores the camera count and the corrected count, and the CSV keeps only kept reps', () => {
    const detected = threeReps();
    const correction = changeRepCount(toggleExcluded(initialCorrection(detected), 2), 1);
    expect(correction.excluded).toEqual([2]);
    expect(correction.repCount).toBe(3);
    expect(extraRepCount(correction)).toBe(1);

    const draft = createDraftSession('A', '2026-11-02');
    const setIndex = draft.lifts[0]?.sets.findIndex((set) => !set.warmup) ?? 0;
    const saved = attachVbtSet(
      draft,
      0,
      setIndex,
      correctedSummary(correction, 20),
      45,
      'side',
      correction,
    );
    const logged = saved.lifts[0]?.vbt?.sets[0];
    expect(saved.lifts[0]?.sets[setIndex]?.reps).toBe(3);
    expect(logged?.camera_rep_count).toBe(3);
    expect(logged?.rep_count).toBe(3);
    expect(logged?.excluded_reps).toEqual([2]);
    expect(logged?.reps.map((rep) => rep.rep)).toEqual([1, 3]);
    expect(logged?.reps.every((rep) => rep.mean_velocity_m_s != null)).toBe(true);

    const csv = sessionVbtCsv(saved) ?? '';
    const rows = csv.trim().split('\n');
    expect(rows[0]?.endsWith('camera_rep_count')).toBe(true);
    const reps = rows.slice(1).map((row) => row.split(',')[5]);
    expect(reps).toEqual(['1', '3']);
    expect(rows.slice(1).every((row) => row.endsWith(',3'))).toBe(true);
  });
});
