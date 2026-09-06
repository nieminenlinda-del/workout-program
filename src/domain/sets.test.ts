import { describe, expect, it } from 'vitest';
import { laterSameKindUnlogged, setDisplayLabel, workSets } from './sets';
import { DAY_TEMPLATES } from '../data/templates';
import { createDraftSession } from './sessionFactory';

describe('warmup vs work sets', () => {
  it('labels W1… then 1… and keeps accessories warmup-free', () => {
    const squat = DAY_TEMPLATES.A.slots[0].sets;
    expect(setDisplayLabel(squat, 0)).toBe('W1');
    expect(setDisplayLabel(squat, 3)).toBe('W4');
    expect(setDisplayLabel(squat, 4)).toBe('1');
    expect(workSets(DAY_TEMPLATES.A.slots[1].sets)).toHaveLength(3);
    expect(DAY_TEMPLATES.A.slots[1].sets.every((s) => !s.warmup)).toBe(true);
  });

  it('seeds T1 squat/bench/deadlift and Day D bench volume with warmups before work', () => {
    const primaries = [
      DAY_TEMPLATES.A.slots[0],
      DAY_TEMPLATES.B.slots[0],
      DAY_TEMPLATES.C.slots[0],
      DAY_TEMPLATES.D.slots[0],
    ];
    for (const slot of primaries) {
      const firstWork = slot.sets.findIndex((s) => !s.warmup);
      expect(firstWork).toBeGreaterThan(0);
      expect(slot.sets.slice(0, firstWork).every((s) => s.warmup)).toBe(true);
      expect(slot.sets.slice(firstWork).every((s) => !s.warmup)).toBe(true);
    }
    expect(DAY_TEMPLATES.A.slots[0].sets.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual([
      20, 25, 30, 40,
    ]);
    expect(DAY_TEMPLATES.B.slots[0].sets.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual([
      20, 25, 30,
    ]);
    expect(DAY_TEMPLATES.D.slots[0].sets.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual([
      20, 25,
    ]);
  });

  it('copies warmup onto the draft and treats leftover-same-kind correctly', () => {
    const draft = createDraftSession('A', '2026-09-07');
    expect(draft.lifts[0]?.sets[0]).toMatchObject({ warmup: true, completed: false });
    expect(draft.lifts[0]?.sets.find((s) => !s.warmup)?.warmup).toBeUndefined();
    expect(laterSameKindUnlogged(draft.lifts[0].sets, 0)).toBe(true);
    const lastWarm = draft.lifts[0].sets.reduce((acc, s, i) => (s.warmup ? i : acc), -1);
    expect(laterSameKindUnlogged(draft.lifts[0].sets, lastWarm)).toBe(false);
  });
});
