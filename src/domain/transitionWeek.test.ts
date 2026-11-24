import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../db/memoryRepository';
import { dayTemplateForDate } from './programWeek';
import { hardSetsInWeek, sessionsInWeek } from './dashboard';
import { loadsFromKraftLabel, localizePlanLabel } from './uiLang';
import { createDraftSession } from './sessionFactory';
import {
  mergeNov23Session,
  nov23DayASession,
  nov23FixPending,
  nov23SessionIsComplete,
  seedNov23Session,
} from './nov23Session';
import { TRANSITION_WEEK_LOADS } from './transitionWeek';
import type { SessionDraft } from '../types/session';

describe('transition week loads', () => {
  it('replaces Tue 24 Nov and leaves Thu, Fri, and the next Tuesday alone', () => {
    const tuesday = dayTemplateForDate('B', '2026-11-24');
    const later = dayTemplateForDate('B', '2026-12-01');
    expect(TRANSITION_WEEK_LOADS.B['b-bench']).toBe(47.5);
    expect(TRANSITION_WEEK_LOADS.B['b-paused-bench']).toBe(40);
    expect(TRANSITION_WEEK_LOADS.B['b-pin-press']).toBe(40);
    expect(TRANSITION_WEEK_LOADS.B['b-db-row']).toBeNull();
    expect(tuesday.slots.map((slot) => slot.displayName ?? slot.exercise_id)).toEqual([
      'Bench press',
      'Paused bench (2 s pause)',
      'Pin press',
      'One-arm DB row',
      'One-arm DB press',
      'Side plank',
    ]);
    expect(tuesday.slots.map((slot) => slot.plan_label ?? slot.sets[0]?.weight_kg)).toEqual([
      47.5,
      40,
      40,
      '3 × 10 each side @ 7 RPE',
      '3 × 10 each side, light',
      '2–3 sets each side',
    ]);
    expect(tuesday.slots[0]?.sets).toHaveLength(3);
    expect(tuesday.slots[0]?.sets.every((set) => set.reps === 4 && set.weight_kg === 47.5)).toBe(true);
    expect(tuesday.slots[1]?.sets.every((set) => set.reps === 3 && set.weight_kg === 40)).toBe(true);
    expect(tuesday.slots[2]?.sets.every((set) => set.reps === 3 && set.weight_kg === 40)).toBe(true);
    expect(tuesday.slots[3]?.sets.every((set) => set.open_load && set.weight_kg === 0 && set.reps === 10 && set.rpe === 7)).toBe(
      true,
    );
    expect(tuesday.slots[4]?.sets.every((set) => set.open_load && set.weight_kg === 0 && set.rpe_label === '')).toBe(true);
    expect(tuesday.focus).not.toBe('loads-from-kraft');
    expect(later.slots.map((slot) => slot.exercise_id)).not.toEqual(tuesday.slots.map((slot) => slot.exercise_id));
    expect(later.slots[0]?.plan_label).not.toBe('loads-from-kraft');
    expect(later.slots[0]?.sets.some((set) => set.weight_kg > 0)).toBe(true);
    expect(dayTemplateForDate('C', '2026-11-26').focus).toBe('loads-from-kraft');
    expect(dayTemplateForDate('C', '2026-11-26').slots[0]?.plan_label).toBe('loads-from-kraft');
    expect(dayTemplateForDate('D', '2026-11-27').slots[0]?.plan_label).toBe('loads-from-kraft');
    expect(dayTemplateForDate('A', '2026-12-01').slots[0]?.plan_label).not.toBe('loads-from-kraft');
    expect(localizePlanLabel('loads-from-kraft', 'en')).toBe('Loads from Kraft');
    expect(loadsFromKraftLabel('sv')).toBe('Belastning från Kraft');

    const draft = createDraftSession('B', '2026-11-24');
    expect(draft.lifts.map((lift) => lift.name)).toEqual([
      'Bench press',
      'Paused bench (2 s pause)',
      'Pin press',
      'One-arm DB row',
      'One-arm DB press',
      'Side plank',
    ]);
    expect(draft.lifts[3]?.sets[0]?.rpe).toBe(7);
    expect(draft.lifts[4]?.sets[0]?.rpe).toBeUndefined();
  });
});

describe('Mon 23 Nov session', () => {
  it('upgrades a partial squat-only day to the full session and then stays put', async () => {
    const partial = nov23DayASession('phone-draft');
    partial.status = 'draft';
    partial.lifts = partial.lifts.slice(0, 1);
    partial.lifts[0]!.sets = [
      { weight_kg: 55, reps: 5, rpe: 8, completed: true, amrap: false },
      { weight_kg: 55, reps: 5, rpe: 8, completed: true, amrap: false },
      { weight_kg: 55, reps: 5, rpe: 9, completed: true, amrap: false, part_label: 'Belt' },
    ];
    partial.notes = 'squats only';
    expect(nov23SessionIsComplete(partial)).toBe(false);
    const merged = mergeNov23Session(null, partial);
    expect(merged.lifts.map((lift) => lift.exercise_id)).toEqual([
      'squat_low_bar',
      'squat_low_bar_paused',
      'bench_regular',
      'ab_rollout',
    ]);
    expect(merged.lifts[0]?.sets.map((set) => set.rpe)).toEqual([undefined, undefined, 8.5]);
    expect(merged.lifts[0]?.sets[2]?.part_label).toBe('Belt');
    expect(merged.lifts[1]?.name).toMatch(/2 s/);
    expect(merged.lifts[1]?.sets.map((set) => set.weight_kg)).toEqual([45, 45]);
    expect(merged.lifts[2]?.sets.map((set) => [set.weight_kg, set.reps])).toEqual([
      [45, 4],
      [45, 4],
      [45, 4],
    ]);
    expect(merged.lifts[3]?.name).toMatch(/knee/i);
    expect(merged.lifts[3]?.sets.every((set) => set.weight_kg === 0 && set.reps === 8 && set.rpe == null)).toBe(true);
    expect(merged.notes).toMatch(/knee sleeves/i);
    expect(merged.counts_toward_tm).toBeUndefined();
    expect(nov23SessionIsComplete(merged)).toBe(true);

    const repo = createMemoryRepository();
    await repo.saveDraft(partial as SessionDraft);
    expect(await seedNov23Session(repo)).toBe('merged');
    expect(await seedNov23Session(repo)).toBe('already');
    const rows = await repo.listAllComplete();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lifts).toHaveLength(4);
    expect(nov23SessionIsComplete(rows[0])).toBe(true);
    expect(await repo.getDraft()).toBeUndefined();
    expect(sessionsInWeek(rows, '2026-11-23')).toHaveLength(1);
    expect(hardSetsInWeek(rows, '2026-11-23').squat).toBe(1);
    expect(hardSetsInWeek(rows, '2026-11-23').bench).toBe(0);
    expect(nov23FixPending([])).toBe(true);
    expect(nov23FixPending(rows)).toBe(false);
  });
});
