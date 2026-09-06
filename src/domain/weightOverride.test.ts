import { describe, expect, it } from 'vitest';
import { createDraftSession } from './sessionFactory';
import { logSetOnDraft, overrideSetWeight, overrideUnloggedLiftWeight } from './weightOverride';

function firstWorkIndex(draft: ReturnType<typeof createDraftSession>, lift = 0): number {
  const i = draft.lifts[lift]?.sets.findIndex((s) => !s.warmup) ?? -1;
  if (i < 0) throw new Error('no work set');
  return i;
}

describe('mid-session weight override', () => {
  it('changes one set without restarting the draft or touching other lifts', () => {
    const draft = createDraftSession('A', '2026-09-07');
    const sessionId = draft.session_id;
    const work = firstWorkIndex(draft);
    const otherLiftKg = draft.lifts[1]?.sets[0]?.weight_kg;
    const next = overrideSetWeight(draft, 0, work, 52.5);

    expect(next.session_id).toBe(sessionId);
    expect(next.lifts[0]?.sets[work]?.weight_kg).toBe(52.5);
    expect(next.lifts[0]?.sets[work]?.completed).toBe(false);
    expect(next.lifts[0]?.sets[work + 1]?.weight_kg).toBe(draft.lifts[0]?.sets[work + 1]?.weight_kg);
    expect(next.lifts[0]?.sets[0]?.weight_kg).toBe(draft.lifts[0]?.sets[0]?.weight_kg);
    expect(next.lifts[1]?.sets[0]?.weight_kg).toBe(otherLiftKg);
    expect(next.updated_at).toEqual(expect.any(String));
  });

  it('copies the override onto later unlogged work sets only — not warmups', () => {
    const draft = createDraftSession('A', '2026-09-07');
    const work = firstWorkIndex(draft);
    draft.lifts[0].sets[work] = {
      ...draft.lifts[0].sets[work],
      weight_kg: 45,
      completed: true,
    };
    const next = overrideSetWeight(draft, 0, work + 1, 52.5, true);
    expect(next.lifts[0]?.sets.filter((s) => s.warmup).map((s) => s.weight_kg)).toEqual(
      draft.lifts[0]?.sets.filter((s) => s.warmup).map((s) => s.weight_kg),
    );
    expect(next.lifts[0]?.sets.filter((s) => !s.warmup).map((s) => s.weight_kg)).toEqual([
      45,
      52.5,
      52.5,
      52.5,
    ]);
  });

  it('working-weight stepper skips warmups and logged work sets', () => {
    const draft = createDraftSession('B', '2026-09-08');
    const work = firstWorkIndex(draft);
    draft.lifts[0].sets[work] = { ...draft.lifts[0].sets[work], weight_kg: 32.5, completed: true };
    const next = overrideUnloggedLiftWeight(draft, 0, 40);
    expect(next.lifts[0]?.sets.filter((s) => s.warmup).every((s) => s.weight_kg < 40)).toBe(true);
    expect(next.lifts[0]?.sets.filter((s) => !s.warmup).map((s) => ({ kg: s.weight_kg, done: s.completed }))).toEqual([
      { kg: 32.5, done: true },
      { kg: 40, done: false },
      { kg: 40, done: false },
      { kg: 40, done: false },
    ]);
  });

  it('keeps the override when the set is logged and applies it forward by default', () => {
    const draft = createDraftSession('A', '2026-09-07');
    const work = firstWorkIndex(draft);
    const logged = logSetOnDraft(draft, 0, work + 1, {
      weight_kg: 51.25,
      reps: 5,
      rpe: 8,
      completed: true,
      amrap: false,
    });
    expect(logged.lifts[0]?.sets[work + 1]).toMatchObject({
      weight_kg: 51.25,
      reps: 5,
      completed: true,
      warmup: undefined,
    });
    expect(logged.lifts[0]?.sets[work + 2]?.weight_kg).toBe(51.25);
    expect(logged.lifts[0]?.sets[work + 3]?.weight_kg).toBe(51.25);
    expect(logged.lifts[0]?.sets[work]?.weight_kg).toBe(draft.lifts[0]?.sets[work]?.weight_kg);
    expect(logged.lifts[0]?.sets[0]?.warmup).toBe(true);
  });

  it('clamps nonsense kg values', () => {
    const draft = createDraftSession('A', '2026-09-07');
    expect(overrideSetWeight(draft, 0, 0, -10).lifts[0]?.sets[0]?.weight_kg).toBe(0);
    expect(overrideSetWeight(draft, 0, 0, 999).lifts[0]?.sets[0]?.weight_kg).toBe(500);
  });
});
