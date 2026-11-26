import { describe, expect, it } from 'vitest';
import { createDraftSession } from './sessionFactory';
import { buildSessionBackup, parseSessionBackupJson } from './sessionBackup';
import {
  addManualExercise,
  addWorkSet,
  canRemoveSet,
  removeLastUnloggedSet,
  removeManualExercise,
  restSecondsForSet,
} from './sessionEdits';
import { isWarmupSet, workSets } from './sets';

describe('add and remove sets', () => {
  it('copies the last work set and leaves logged sets and other sessions alone', () => {
    const today = createDraftSession('B', '2026-11-24');
    const other = createDraftSession('B', '2026-12-01');
    const otherCount = other.lifts[0]?.sets.length;
    const bench = today.lifts[0];
    const work = workSets(bench?.sets ?? []);
    const last = work[work.length - 1];
    if (last) {
      last.completed = true;
      last.rpe = 8;
      last.part_label = 'Belt';
    }
    const next = addWorkSet(today, 0);
    const added = next.lifts[0]?.sets.at(-1);
    expect(workSets(next.lifts[0]?.sets ?? [])).toHaveLength(work.length + 1);
    expect(added?.completed).toBe(false);
    expect(added?.rpe).toBeUndefined();
    expect(added?.part_label).toBeUndefined();
    expect(added?.weight_kg).toBe(last?.weight_kg);
    expect(added?.reps).toBe(last?.reps);
    expect(added?.warmup).toBeUndefined();
    expect(next.lifts[0]?.sets.find((set) => set.completed)?.rpe).toBe(8);
    expect(other.lifts[0]?.sets).toHaveLength(otherCount ?? 0);
    expect(next.session_id).toBe(today.session_id);
  });

  it('refuses to drop a logged set or the last remaining set, and reindexes camera data', () => {
    const draft = createDraftSession('B', '2026-11-24');
    const lift = draft.lifts[0];
    if (!lift) throw new Error('missing bench');
    const firstWork = lift.sets.findIndex((set) => !isWarmupSet(set));
    lift.sets[firstWork] = { ...lift.sets[firstWork]!, completed: true, rpe: 7 };
    lift.vbt = {
      threshold_pct: 20,
      sets: [
        { set_index: firstWork, reps: [{ rep: 1 }], rep_count: 1, threshold_pct: 20, stopped_for_loss: false },
        { set_index: firstWork + 2, reps: [{ rep: 1 }], rep_count: 1, threshold_pct: 20, stopped_for_loss: false },
      ],
    };
    const before = lift.sets.length;
    const trimmed = removeLastUnloggedSet(draft, 0);
    expect(trimmed.lifts[0]?.sets).toHaveLength(before - 1);
    expect(trimmed.lifts[0]?.sets.some((set) => set.completed && set.rpe === 7)).toBe(true);
    expect(trimmed.lifts[0]?.vbt?.sets.map((set) => set.set_index)).toEqual([firstWork]);

    const lone = createDraftSession('A', '2026-11-23');
    lone.lifts[0]!.sets = [lone.lifts[0]!.sets.find((set) => !isWarmupSet(set))!];
    expect(canRemoveSet(lone.lifts[0])).toBe(false);
    expect(removeLastUnloggedSet(lone, 0)).toBe(lone);

    const loggedOnly = addWorkSet(lone, 0);
    loggedOnly.lifts[0]!.sets = loggedOnly.lifts[0]!.sets.map((set) => ({ ...set, completed: true }));
    expect(removeLastUnloggedSet(loggedOnly, 0)).toBe(loggedOnly);
  });

  it('uses the planned rest, then the last planned rest for an extra set', () => {
    expect(restSecondsForSet([{ rest_sec: 180 }, { rest_sec: 90 }], 0)).toBe(180);
    expect(restSecondsForSet([{ rest_sec: 180 }, { rest_sec: 90 }], 5)).toBe(90);
    expect(restSecondsForSet(undefined, 0)).toBe(90);
  });
});

describe('manual exercise', () => {
  it('adds a named bodyweight each-side exercise and removes it only before it is logged', () => {
    const today = createDraftSession('B', '2026-11-24');
    const other = createDraftSession('A', '2026-11-30');
    const next = addManualExercise(today, {
      name: '  Dead   bug ',
      setCount: 2,
      reps: 8,
      bodyweight: true,
      eachSide: true,
    });
    const added = next.lifts.at(-1);
    expect(added?.name).toBe('Dead bug');
    expect(added?.manual).toBe(true);
    expect(added?.each_side).toBe(true);
    expect(added?.equipment).toBe('bodyweight');
    expect(added?.counts_toward_tm).toBe(false);
    expect(added?.sets).toHaveLength(2);
    expect(added?.sets.every((set) => set.reps === 8 && set.weight_kg === 0 && !set.completed)).toBe(true);
    expect(other.lifts.some((lift) => lift.manual)).toBe(false);
    expect(addManualExercise(today, { name: '   ' })).toBe(today);

    const removed = removeManualExercise(next, next.lifts.length - 1);
    expect(removed.lifts.some((lift) => lift.manual)).toBe(false);
    expect(removeManualExercise(today, 0)).toBe(today);

    const logged = addManualExercise(today, { name: 'Rehab crawl', weightKg: 5 });
    const extra = logged.lifts.at(-1);
    expect(extra?.equipment).toBe('dumbbells');
    expect(extra?.sets[0]?.weight_kg).toBe(5);
    extra!.sets[0] = { ...extra!.sets[0]!, completed: true };
    expect(removeManualExercise(logged, logged.lifts.length - 1).lifts.at(-1)?.name).toBe('Rehab crawl');

    const backup = buildSessionBackup([logged]);
    const parsed = parseSessionBackupJson(JSON.stringify(backup));
    const round = parsed.sessions[0]?.lifts.find((lift) => lift.name === 'Rehab crawl');
    expect(round?.manual).toBe(true);
    expect(round?.exercise_id).toBe('custom');
    expect(round?.sets).toHaveLength(3);
  });
});
