import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { createDraftSession } from './sessionFactory';
import {
  formatLoad,
  formatRestLabel,
  formatSetScheme,
  plannedLiftSummary,
  uniqueAltNames,
} from './workoutPreview';

describe('planned session preview (template only)', () => {
  it('summarizes Day A squat T1 as 4 × 5+ with 3:00 rest from the seed template', () => {
    const squat = plannedLiftSummary(DAY_TEMPLATES.A.slots[0]);
    expect(squat.name).toBe('Low-bar squat');
    expect(squat.scheme).toBe('4 × 5+');
    expect(squat.restLabel).toBe('3:00 rest');
    expect(squat.sets).toHaveLength(4);
    expect(squat.sets[3]).toMatchObject({
      weight_kg: 50,
      reps: 5,
      amrap: true,
      rest_sec: 180,
    });
  });

  it('summarizes Day D bench volume as 5 × 8 with 2:00 rest', () => {
    const bench = plannedLiftSummary(DAY_TEMPLATES.D.slots[0]);
    expect(bench.name).toBe('Bench press (volume)');
    expect(bench.scheme).toBe('5 × 8');
    expect(bench.restLabel).toBe('2:00 rest');
    expect(bench.optional).toBe(false);
  });

  it('marks optional Day D arm work and lists alternatives without creating a draft', () => {
    const curl = plannedLiftSummary(DAY_TEMPLATES.D.slots[3]);
    expect(curl.optional).toBe(true);
    expect(curl.scheme).toBe('2 × 12');
    expect(curl.restLabel).toBe('1:00 rest');

    const squatSlot = DAY_TEMPLATES.D.slots[1];
    expect(uniqueAltNames(squatSlot.exercise_id, squatSlot.alternatives)).toEqual([
      'Goblet squat',
    ]);
  });

  it('reads seed templates only — preview rows have no session id, draft status, or logged sets', () => {
    const preview = DAY_TEMPLATES.A.slots.map(plannedLiftSummary);
    expect(preview.map((p) => p.slot_id)).toEqual(DAY_TEMPLATES.A.slots.map((s) => s.slot_id));
    for (const row of preview) {
      expect(row).not.toHaveProperty('session_id');
      expect(row).not.toHaveProperty('status');
      for (const set of row.sets) {
        expect(set).not.toHaveProperty('completed');
      }
    }
    const draft = createDraftSession('A', '2026-09-04');
    expect(draft.status).toBe('draft');
    expect(draft.lifts[0]?.sets[0]).toHaveProperty('completed', false);
  });

  it('formats mixed-rep schemes and bodyweight load', () => {
    expect(
      formatSetScheme([
        { weight_kg: 40, reps: 8, rpe: 7, rest_sec: 90 },
        { weight_kg: 40, reps: 8, rpe: 7, rest_sec: 90 },
        { weight_kg: 42.5, reps: 6, rpe: 8, rest_sec: 90 },
      ]),
    ).toBe('2 × 8, 1 × 6');
    expect(formatLoad(0)).toBe('BW');
    expect(formatLoad(47.5)).toBe('47.5 kg');
    expect(formatRestLabel(90)).toBe('1:30 rest');
  });
});
