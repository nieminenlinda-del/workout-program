import { describe, expect, it } from 'vitest';
import { laterSameKindUnlogged, setDisplayLabel, workSets } from './sets';
import { DAY_TEMPLATES } from '../data/templates';
import { createDraftSession } from './sessionFactory';
import { attachWarmups, warmupKindFor, warmupLadder } from './warmupLadder';

describe('warmup vs work sets', () => {
  it('labels W1… then 1… and keeps accessories warmup-free', () => {
    const squat = attachWarmups(
      DAY_TEMPLATES.A.slots[0].sets,
      warmupKindFor(DAY_TEMPLATES.A.slots[0].exercise_id),
    );
    expect(setDisplayLabel(squat, 0)).toBe('W1');
    expect(setDisplayLabel(squat, 2)).toBe('W3');
    expect(setDisplayLabel(squat, 3)).toBe('1');
    expect(workSets(DAY_TEMPLATES.A.slots[1].sets)).toHaveLength(3);
    expect(DAY_TEMPLATES.A.slots[1].sets.every((s) => !s.warmup)).toBe(true);
  });

  it('attaches Kraft ladders on T1 / Day D bench and leaves accessories bare', () => {
    const squatW = warmupLadder(47.5, 'squat').map((s) => s.weight_kg);
    const benchW = warmupLadder(35, 'bench').map((s) => s.weight_kg);
    const dlW = warmupLadder(60, 'deadlift').map((s) => s.weight_kg);

    const squat = attachWarmups(DAY_TEMPLATES.A.slots[0].sets, 'squat');
    const bench = attachWarmups(DAY_TEMPLATES.B.slots[0].sets, 'bench');
    const dl = attachWarmups(DAY_TEMPLATES.C.slots[0].sets, 'deadlift');
    const volume = attachWarmups(DAY_TEMPLATES.D.slots[0].sets, 'bench');

    expect(squat.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual(squatW);
    expect(bench.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual(benchW);
    expect(dl.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual(dlW);
    expect(volume.filter((s) => s.warmup).map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }))).toEqual(
      warmupLadder(30, 'bench'),
    );
    expect(DAY_TEMPLATES.A.slots[1].sets.every((s) => !s.warmup)).toBe(true);
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
