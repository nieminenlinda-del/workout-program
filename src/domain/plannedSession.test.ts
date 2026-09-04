import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { createDraftSession } from './sessionFactory';
import {
  formatLoad,
  formatSetsReps,
  formatUniformRest,
  plannedSessionFor,
} from './plannedSession';

describe('planned session (read-only template browse)', () => {
  it('builds today’s letter from the same A–D templates as Start, without a draft', () => {
    const planned = plannedSessionFor('A');
    const draft = createDraftSession('A', '2026-09-04');

    expect(planned.template_day).toBe('A');
    expect(planned.title).toBe(DAY_TEMPLATES.A.title);
    expect(planned.lifts.map((l) => l.exercise_id)).toEqual(
      DAY_TEMPLATES.A.slots.map((s) => s.exercise_id),
    );
    expect(planned.lifts.map((l) => l.name)).toEqual(draft.lifts.map((l) => l.name));

    expect(planned).not.toHaveProperty('session_id');
    expect(planned).not.toHaveProperty('status');
    expect(planned.lifts[0]?.sets.every((s) => !('completed' in s))).toBe(true);
  });

  it('summarizes squat day sets × reps and prescribed rest', () => {
    const squat = plannedSessionFor('A').lifts[0];
    expect(squat?.name).toBe('Low-bar squat');
    expect(squat?.setsRepsLabel).toBe('4 × 5');
    expect(squat?.restLabel).toBe('3:00');
    expect(squat?.sets).toHaveLength(4);
    expect(squat?.sets[3]).toMatchObject({ reps: 5, amrap: true, rest_sec: 180 });
  });

  it('marks optional Friday accessories and AMRAP pull-ups', () => {
    const d = plannedSessionFor('D');
    const pull = d.lifts.find((l) => l.exercise_id === 'pull_up');
    const curls = d.lifts.find((l) => l.exercise_id === 'curl_db');
    expect(pull?.setsRepsLabel).toBe('3 × 6+');
    expect(pull?.restLabel).toBe('1:30');
    expect(curls?.optional).toBe(true);
    expect(curls?.setsRepsLabel).toBe('2 × 12');
    expect(curls?.restLabel).toBe('1:00');
  });

  it('formats load, mixed reps, and mixed rest', () => {
    expect(formatLoad(0)).toBe('BW');
    expect(formatLoad(47.5)).toBe('47.5 kg');
    expect(formatSetsReps([{ weight_kg: 0, reps: 8, rpe: 7, rest_sec: 90 }])).toBe('1 × 8');
    expect(
      formatSetsReps([
        { weight_kg: 50, reps: 5, rpe: 7, rest_sec: 180 },
        { weight_kg: 50, reps: 3, rpe: 8, rest_sec: 180 },
      ]),
    ).toBe('5 / 3');
    expect(
      formatUniformRest([
        { weight_kg: 50, reps: 5, rpe: 7, rest_sec: 90 },
        { weight_kg: 50, reps: 5, rpe: 7, rest_sec: 120 },
      ]),
    ).toBeNull();
  });
});
