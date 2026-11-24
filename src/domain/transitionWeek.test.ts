import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../db/memoryRepository';
import { dayTemplateForDate } from './programWeek';
import { hardSetsInWeek, sessionsInWeek } from './dashboard';
import { loadsFromKraftLabel, localizePlanLabel } from './uiLang';
import { mergeNov23Session, nov23DayASession, seedNov23Session } from './nov23Session';
import type { SessionDraft } from '../types/session';

describe('transition week loads', () => {
  it('blanks Tue Thu Fri this week and leaves the week after alone', () => {
    const tuesday = dayTemplateForDate('B', '2026-11-24');
    const later = dayTemplateForDate('B', '2026-12-01');
    expect(tuesday.slots.map((slot) => slot.exercise_id)).toEqual(later.slots.map((slot) => slot.exercise_id));
    expect(tuesday.slots.every((slot) => slot.plan_label === 'loads-from-kraft')).toBe(true);
    expect(tuesday.slots.every((slot) => slot.sets.every((set) => set.open_load && set.weight_kg === 0))).toBe(true);
    expect(later.slots[0]?.sets.some((set) => set.weight_kg > 0)).toBe(true);
    expect(dayTemplateForDate('C', '2026-11-26').slots[0]?.plan_label).toBe('loads-from-kraft');
    expect(dayTemplateForDate('D', '2026-11-27').slots[0]?.plan_label).toBe('loads-from-kraft');
    expect(dayTemplateForDate('A', '2026-12-01').slots[0]?.plan_label).not.toBe('loads-from-kraft');
    expect(localizePlanLabel('loads-from-kraft', 'en')).toBe('Loads from Kraft');
    expect(loadsFromKraftLabel('sv')).toBe('Belastning från Kraft');
  });
});

describe('Mon 23 Nov session', () => {
  it('keeps squat sets she already logged and fills the rest once', async () => {
    const partial = nov23DayASession('phone-draft');
    partial.status = 'draft';
    partial.lifts = partial.lifts.slice(0, 1);
    partial.lifts[0]!.sets = [
      { weight_kg: 55, reps: 5, rpe: 8, completed: true, amrap: false },
      { weight_kg: 55, reps: 5, rpe: 8, completed: true, amrap: false },
      { weight_kg: 55, reps: 5, rpe: 9, completed: true, amrap: false, part_label: 'Belt' },
    ];
    const merged = mergeNov23Session(null, partial);
    expect(merged.lifts.map((lift) => lift.exercise_id)).toEqual([
      'squat_low_bar',
      'squat_low_bar_paused',
      'bench_regular',
      'ab_rollout',
    ]);
    expect(merged.lifts[0]?.sets.map((set) => set.rpe)).toEqual([8, 8, 9]);
    expect(merged.lifts[1]?.sets.map((set) => set.weight_kg)).toEqual([45, 45]);
    expect(merged.counts_toward_tm).toBeUndefined();

    const repo = createMemoryRepository();
    await repo.saveDraft(partial as SessionDraft);
    expect(await seedNov23Session(repo)).toBe('merged');
    expect(await seedNov23Session(repo)).toBe('merged');
    const rows = await repo.listAllComplete();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lifts).toHaveLength(4);
    expect(await repo.getDraft()).toBeUndefined();
    expect(sessionsInWeek(rows, '2026-11-23')).toHaveLength(1);
    expect(hardSetsInWeek(rows, '2026-11-23').squat).toBe(3);
    expect(hardSetsInWeek(rows, '2026-11-23').bench).toBe(0);
    const fresh = nov23DayASession();
    expect(fresh.lifts[0]?.sets.map((set) => set.rpe)).toEqual([undefined, undefined, 8.5]);
    expect(fresh.lifts[0]?.sets[2]?.part_label).toBe('Belt');
    expect(fresh.lifts.slice(1).every((row) => row.sets.every((set) => set.rpe == null))).toBe(true);
    expect(fresh.notes).toMatch(/knee sleeves/i);
  });
});
