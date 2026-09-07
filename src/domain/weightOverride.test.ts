import { describe, expect, it } from 'vitest';
import { createDraftSession } from './sessionFactory';
import { logSetOnDraft, overrideSetWeight, overrideUnloggedLiftWeight } from './weightOverride';
import { formatPlanLoad, loggedDiffersFromPlan, prescriptionWeightKg } from './setPrescription';

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
    expect(next.lifts[0]?.sets[work]?.target_weight_kg).toBe(52.5);
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
    expect(
      next.lifts[0]?.sets.filter((s) => !s.warmup).map((s) => s.target_weight_kg),
    ).toEqual([45, 52.5, 52.5, 52.5]);
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
    expect(next.lifts[0]?.sets.filter((s) => !s.warmup && !s.completed).every((s) => s.target_weight_kg === 40)).toBe(
      true,
    );
  });

  it('logging set 1 at a different kg does not change leftover prescribed weights', () => {
    const draft = createDraftSession('A', '2026-09-07');
    const work = firstWorkIndex(draft);
    expect(draft.lifts[0].sets.filter((s) => !s.warmup).map((s) => s.weight_kg)).toEqual([
      45, 47.5, 47.5, 50,
    ]);

    const logged = logSetOnDraft(draft, 0, work, {
      weight_kg: 42.5,
      reps: 5,
      rpe: 6.5,
      completed: true,
      amrap: false,
    });

    expect(logged.lifts[0]?.sets.filter((s) => !s.warmup).map((s) => s.weight_kg)).toEqual([
      42.5, 47.5, 47.5, 50,
    ]);
    expect(logged.lifts[0]?.sets.filter((s) => !s.warmup).map((s) => s.target_weight_kg)).toEqual([
      45, 47.5, 47.5, 50,
    ]);
  });

  it('keeps leftover work targets after logging set 1 (T1 wave 45 / 47.5 / 47.5 / 50)', () => {
    const draft = createDraftSession('A', '2026-09-07');
    const work = firstWorkIndex(draft);
    const planned = draft.lifts[0].sets.filter((s) => !s.warmup).map((s) => s.weight_kg);
    expect(planned).toEqual([45, 47.5, 47.5, 50]);

    const logged = logSetOnDraft(draft, 0, work, {
      weight_kg: 45,
      reps: 5,
      rpe: 6.5,
      completed: true,
      amrap: false,
    });

    const workSets = logged.lifts[0]?.sets.filter((s) => !s.warmup) ?? [];
    expect(workSets[0]).toMatchObject({
      weight_kg: 45,
      reps: 5,
      completed: true,
      target_weight_kg: 45,
      target_reps: 5,
    });
    expect(workSets.slice(1).map((s) => ({ kg: s.weight_kg, target: s.target_weight_kg, done: s.completed }))).toEqual([
      { kg: 47.5, target: 47.5, done: false },
      { kg: 47.5, target: 47.5, done: false },
      { kg: 50, target: 50, done: false },
    ]);
    expect(logged.lifts[0]?.sets[0]?.warmup).toBe(true);
    expect(formatPlanLoad(workSets[1]!)).toBe('47.5 kg × 5');
  });

  it('opt-in apply-forward fills leftover working kg but leaves displayed targets', () => {
    const draft = createDraftSession('A', '2026-09-07');
    const work = firstWorkIndex(draft);
    const logged = logSetOnDraft(
      draft,
      0,
      work,
      {
        weight_kg: 42.5,
        reps: 5,
        rpe: 7,
        completed: true,
        amrap: false,
      },
      true,
    );
    const workSets = logged.lifts[0]?.sets.filter((s) => !s.warmup) ?? [];
    expect(workSets[0]).toMatchObject({
      weight_kg: 42.5,
      completed: true,
      target_weight_kg: 45,
    });
    expect(loggedDiffersFromPlan(workSets[0]!)).toBe(true);
    expect(workSets.slice(1).map((s) => ({ kg: s.weight_kg, target: prescriptionWeightKg(s), done: s.completed }))).toEqual(
      [
        { kg: 42.5, target: 47.5, done: false },
        { kg: 42.5, target: 47.5, done: false },
        { kg: 42.5, target: 50, done: false },
      ],
    );
    expect(formatPlanLoad(workSets[3]!)).toBe('50 kg × 5+');
  });

  it('snapshots leftover working kg as the plan when older drafts omit targets', () => {
    const draft = createDraftSession('A', '2026-09-07');
    const work = firstWorkIndex(draft);
    const later = draft.lifts[0].sets[work + 1];
    later.target_weight_kg = undefined;
    later.target_reps = undefined;
    const logged = logSetOnDraft(
      draft,
      0,
      work,
      { weight_kg: 40, reps: 5, rpe: 7, completed: true, amrap: false },
      true,
    );
    expect(logged.lifts[0]?.sets[work + 1]).toMatchObject({
      weight_kg: 40,
      completed: false,
      target_weight_kg: 47.5,
      target_reps: 5,
    });
  });

  it('clamps nonsense kg values', () => {
    const draft = createDraftSession('A', '2026-09-07');
    expect(overrideSetWeight(draft, 0, 0, -10).lifts[0]?.sets[0]?.weight_kg).toBe(0);
    expect(overrideSetWeight(draft, 0, 0, 999).lifts[0]?.sets[0]?.weight_kg).toBe(500);
  });
});
