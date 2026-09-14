import { describe, expect, it, vi } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { createMemoryRepository } from '../db/memoryRepository';
import type { SessionLog } from '../types/session';
import { createDraftSession, swapLiftExercise } from './sessionFactory';
import { isWarmupSet } from './sets';
import {
  formatLoad,
  formatRestLabel,
  formatSetScheme,
  formatWorkLabel,
  plannedDayPreview,
  plannedLiftSummary,
  uniqueAltNames,
  shouldOfferHomeWeek1Restore,
} from './workoutPreview';
import { warmupLadder } from './warmupLadder';
import { DEFAULT_READINESS } from '../types/session';
import type { ExerciseId } from '../types/exercises';
import { historyVisibilityLine, lastLogGapLine } from './sessionBackup';

function completeAllWorkSets(day: 'A' | 'B' | 'C' | 'D', date: string): SessionLog {
  const draft = createDraftSession(day, date);
  draft.status = 'complete';
  for (const lift of draft.lifts) {
    lift.sets = lift.sets.map((set) => (isWarmupSet(set) ? set : { ...set, completed: true }));
  }
  return draft;
}

function week1Logs(): SessionLog[] {
  return [
    completeAllWorkSets('A', '2026-09-07'),
    completeAllWorkSets('B', '2026-09-08'),
    completeAllWorkSets('C', '2026-09-10'),
    completeAllWorkSets('D', '2026-09-11'),
  ];
}

describe('planned session preview (template only)', () => {
  it('summarizes Day A squat T1 as 3 × 5 with 3:00 rest from the seed template', () => {
    const squat = plannedLiftSummary(DAY_TEMPLATES.A.slots[0]);
    expect(squat.name).toBe('Low-bar squat');
    expect(squat.scheme).toBe('3 × 5');
    expect(squat.workLabel).toBe('55 kg · 3 × 5');
    expect(squat.warmupLabel).toBe('W 20 kg → 27.5 kg → 37.5 kg → 47.5 kg');
    expect(squat.restLabel).toBe('3:00 rest');
    expect(squat.sets.filter((s) => s.warmup)).toHaveLength(4);
    expect(squat.sets.filter((s) => !s.warmup)).toHaveLength(3);
    expect(squat.sets[0]).toMatchObject({ label: 'W1', warmup: true, weight_kg: 20, reps: 5 });
    expect(squat.sets.filter((s) => !s.warmup).every((s) => s.weight_kg === 55 && s.reps === 5 && !s.amrap)).toBe(
      true,
    );
  });

  it('summarizes Day D bench volume as 2 × 5 with 2:00 rest', () => {
    const bench = plannedLiftSummary(DAY_TEMPLATES.D.slots[0]);
    expect(bench.name).toBe('Bench press (volume)');
    expect(bench.scheme).toBe('2 × 5');
    expect(bench.restLabel).toBe('2:00 rest');
    expect(bench.optional).toBe(false);
    expect(bench.sets.filter((s) => !s.warmup).every((s) => s.weight_kg === 40)).toBe(true);
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

    const tri = plannedLiftSummary(DAY_TEMPLATES.D.slots[4]);
    expect(tri.name).toBe('Cable rope pushdown');
    expect(tri.optional).toBe(true);
    expect(tri.alternatives).toEqual(['Band tricep pushdown']);
    expect(tri.sets.filter((s) => !s.warmup).every((s) => s.weight_kg === 12.5 && s.reps === 12)).toBe(true);
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
    expect(formatWorkLabel(DAY_TEMPLATES.A.slots[0].sets)).toBe('55 kg · 3 × 5');
    const plank = plannedLiftSummary(DAY_TEMPLATES.A.slots[3]);
    expect(plank.name).toBe('Plank');
    expect(plank.timed).toBe(true);
    expect(plank.scheme).toBe('3 × 60s');
    expect(plank.workLabel).toBe('BW · 3 × 60s');
  });
});

describe('upcoming preview Last: from completed logs (no draft)', () => {
  it('shows Week 1 squat and accessories on Week 2 Day A (asOf Sunday 13th and Monday 14th)', () => {
    const week1 = week1Logs();
    for (const asOf of ['2026-09-13', '2026-09-14'] as const) {
      const preview = plannedDayPreview(DAY_TEMPLATES.A, week1, asOf);
      expect(preview.map((row) => row.slot_id)).toEqual(DAY_TEMPLATES.A.slots.map((s) => s.slot_id));
      expect(preview.map((row) => row.lastLine)).toEqual([
        'Last: 47.5 kg × 5',
        'Last: 50 kg × 8 · Barbell',
        'Last: 12 kg × 8 · DBs',
        'Last: BW × 60s',
      ]);
      expect(preview[0]?.last).toMatchObject({
        date: '2026-09-07',
        weight_kg: 47.5,
        reps: 5,
        exercise_id: 'squat_low_bar',
      });
      for (const row of preview) {
        expect(row).not.toHaveProperty('session_id');
        expect(row).not.toHaveProperty('status');
      }
    }
    const sunday = plannedDayPreview(DAY_TEMPLATES.A, week1, '2026-09-13');
    expect(sunday[0]?.workLabel).toBe('47.5 kg · 3 × 5');
    const monday = plannedDayPreview(DAY_TEMPLATES.A, week1, '2026-09-14');
    expect(monday[0]?.workLabel).toBe('57.5 kg · 3 × 4');
    expect(monday[0]?.warmupLabel).toBe(
      `W ${warmupLadder(57.5, 'squat').map((s) => `${s.weight_kg} kg`).join(' → ')}`,
    );
  });

  it('loads Week 1 through listComplete and still paints Last: without starting', async () => {
    const week1 = week1Logs();
    const repo = createMemoryRepository(week1);
    const history = await repo.listComplete(60);
    expect(history).toHaveLength(4);

    const createDraft = vi.spyOn(await import('./sessionFactory'), 'createDraftSession');
    const preview = plannedDayPreview(DAY_TEMPLATES.A, history, '2026-09-14');
    expect(preview.map((row) => row.lastLine)).toEqual([
      'Last: 47.5 kg × 5',
      'Last: 50 kg × 8 · Barbell',
      'Last: 12 kg × 8 · DBs',
      'Last: BW × 60s',
    ]);
    expect(preview[0]?.workLabel).toBe('57.5 kg · 3 × 4');
    expect(createDraft).not.toHaveBeenCalled();
    createDraft.mockRestore();
  });

  it('shows band history on the Day D cable slot (same slot family)', () => {
    const draft = createDraftSession('D', '2026-09-11');
    const triIndex = draft.lifts.findIndex((row) => row.exercise_id === 'cable_rope_pushdown');
    if (triIndex < 0) throw new Error('missing tricep slot');
    const swapped = swapLiftExercise(draft, triIndex, 'tricep_pushdown_band');
    swapped.status = 'complete';
    swapped.lifts[triIndex].sets = [{ weight_kg: 0, reps: 12, rpe: 8, completed: true }];

    const preview = plannedDayPreview(DAY_TEMPLATES.D, [swapped], '2026-09-13');
    const cable = preview.find((row) => row.exercise_id === 'cable_rope_pushdown');
    expect(cable?.name).toBe('Cable rope pushdown');
    expect(cable?.lastLine).toBe('Last: BW × 12 · Bands');
    expect(cable?.last).toMatchObject({
      exercise_id: 'tricep_pushdown_band',
      weight_kg: 0,
      reps: 12,
      date: '2026-09-11',
    });
  });

  it('stays No prior log when history is empty — still not a draft', () => {
    const preview = plannedDayPreview(DAY_TEMPLATES.A, [], '2026-09-13');
    expect(preview.every((row) => row.lastLine === 'No prior log')).toBe(true);
    expect(preview[0]).not.toHaveProperty('session_id');
    expect(historyVisibilityLine(0)).toMatch(/empty on this install \(0\)/);
    expect(lastLogGapLine(2, 0)).toMatch(/logged work sets/);
  });

  it('shows Last: from a 2026-09-07 complete squat log that omits status and set.completed', () => {
    const week1 = {
      session_id: 'w1-a-legacy',
      date: '2026-09-07',
      template_day: 'A' as const,
      readiness: DEFAULT_READINESS,
      pain_flag: false,
      notes: '',
      lifts: [
        {
          name: 'Low-bar squat',
          exercise_id: 'squat_low_bar' as ExerciseId,
          sets: [
            { weight_kg: 47.5, reps: 5, rpe: 7 },
            { weight_kg: 47.5, reps: 5, rpe: 7 },
            { weight_kg: 47.5, reps: 5, rpe: 8 },
          ],
        },
        {
          name: 'Romanian deadlift',
          exercise_id: 'rdl' as ExerciseId,
          sets: [
            { weight_kg: 50, reps: 8, rpe: 7 },
            { weight_kg: 50, reps: 8, rpe: 7 },
            { weight_kg: 50, reps: 8, rpe: 7.5 },
          ],
        },
      ],
    };
    const preview = plannedDayPreview(DAY_TEMPLATES.A, [week1 as SessionLog], '2026-09-14');
    expect(preview[0]?.lastLine).toBe('Last: 47.5 kg × 5');
    expect(preview[1]?.lastLine).toBe('Last: 50 kg × 8 · Barbell');
    expect(preview[0]?.workLabel).toBe('57.5 kg · 3 × 4');
  });

  it('offers home Restore when Session log (1) does not paint T1 Last:', () => {
    expect(shouldOfferHomeWeek1Restore(plannedDayPreview(DAY_TEMPLATES.A, [], '2026-09-14'))).toBe(
      true,
    );
    expect(
      shouldOfferHomeWeek1Restore(plannedDayPreview(DAY_TEMPLATES.A, week1Logs(), '2026-09-14')),
    ).toBe(false);

    const otherDay = completeAllWorkSets('B', '2026-09-08');
    const unmatched = plannedDayPreview(DAY_TEMPLATES.A, [otherDay], '2026-09-14');
    expect(unmatched[0]?.lastLine).toBe('No prior log');
    expect(shouldOfferHomeWeek1Restore(unmatched)).toBe(true);
    expect(unmatched[0]?.workLabel).toBe('57.5 kg · 3 × 4');

    const sameDaySquat = completeAllWorkSets('A', '2026-09-14');
    expect(
      shouldOfferHomeWeek1Restore(plannedDayPreview(DAY_TEMPLATES.A, [sameDaySquat], '2026-09-14')),
    ).toBe(true);
  });
});
