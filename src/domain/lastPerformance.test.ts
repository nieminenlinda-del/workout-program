import { describe, expect, it } from 'vitest';
import { createDraftSession, swapLiftExercise } from './sessionFactory';
import {
  formatLastPerformance,
  lastMatchingPerformance,
  lastPerformanceByExercise,
  topWorkSet,
} from './lastPerformance';
import type { SessionLog } from '../types/session';

function completeSession(
  day: 'A' | 'B' | 'C' | 'D',
  date: string,
  exerciseId: SessionLog['lifts'][number]['exercise_id'],
  sets: { weight_kg: number; reps: number; completed?: boolean }[],
): SessionLog {
  const draft = createDraftSession(day, date);
  draft.status = 'complete';
  const lift = draft.lifts.find((row) => row.exercise_id === exerciseId);
  if (!lift) throw new Error(`missing ${exerciseId}`);
  lift.sets = sets.map((s, i) => ({
    weight_kg: s.weight_kg,
    reps: s.reps,
    rpe: 8,
    completed: s.completed ?? true,
    amrap: lift.sets[i]?.amrap,
  }));
  return draft;
}

describe('last matching performance', () => {
  it('ignores warmup sets even when they are heavier or first', () => {
    expect(
      topWorkSet([
        { weight_kg: 20, reps: 8, rpe: 5, completed: true, warmup: true },
        { weight_kg: 40, reps: 3, rpe: 5, completed: true, warmup: true },
        { weight_kg: 47.5, reps: 5, rpe: 8, completed: true },
        { weight_kg: 50, reps: 3, rpe: 8, completed: true },
      ]),
    ).toMatchObject({ weight_kg: 50, reps: 3 });
    expect(topWorkSet([
      { weight_kg: 40, reps: 3, rpe: 5, completed: true, warmup: true },
      { weight_kg: 47.5, reps: 5, rpe: 8, completed: true },
    ])?.warmup).toBeFalsy();
  });

  it('uses the top work set (heaviest completed; tie → most reps, then last)', () => {
    expect(
      topWorkSet([
        { weight_kg: 45, reps: 5, rpe: 7, completed: true },
        { weight_kg: 50, reps: 4, rpe: 8, completed: true },
        { weight_kg: 50, reps: 5, rpe: 8, completed: true },
        { weight_kg: 47.5, reps: 8, rpe: 7, completed: false },
      ]),
    ).toMatchObject({ weight_kg: 50, reps: 5 });
  });

  it('prefers the previous occurrence of the same template day', () => {
    const olderA = completeSession('A', '2026-08-24', 'squat_low_bar', [
      { weight_kg: 45, reps: 5 },
    ]);
    const lastA = completeSession('A', '2026-08-31', 'squat_low_bar', [
      { weight_kg: 47.5, reps: 5 },
      { weight_kg: 50, reps: 5 },
    ]);
    const sameWeekB = completeSession('B', '2026-09-01', 'bench_regular', [
      { weight_kg: 35, reps: 5 },
    ]);

    const squat = lastMatchingPerformance(
      [olderA, lastA, sameWeekB],
      'squat_low_bar',
      'A',
      '2026-09-07',
    );
    expect(squat).toMatchObject({
      date: '2026-08-31',
      weight_kg: 50,
      reps: 5,
      template_day: 'A',
    });
    expect(formatLastPerformance(squat)).toBe('Last: 50 kg × 5');
  });

  it('falls back to the same exercise on another day when this day has no log', () => {
    const fridayRdl = completeSession('D', '2026-08-28', 'front_squat_light', [
      { weight_kg: 30, reps: 8 },
    ]);
    const rdlOnC = completeSession('C', '2026-08-27', 'rdl', [{ weight_kg: 42.5, reps: 8 }]);
    expect(lastMatchingPerformance([fridayRdl, rdlOnC], 'rdl', 'A', '2026-09-07')).toMatchObject({
      date: '2026-08-27',
      weight_kg: 42.5,
      reps: 8,
      template_day: 'C',
    });
  });

  it('ignores same-day or future logs and incomplete sets', () => {
    const today = completeSession('A', '2026-09-07', 'squat_low_bar', [
      { weight_kg: 60, reps: 3 },
    ]);
    const unfinished = completeSession('A', '2026-08-31', 'squat_low_bar', [
      { weight_kg: 55, reps: 5, completed: false },
    ]);
    expect(lastMatchingPerformance([today, unfinished], 'squat_low_bar', 'A', '2026-09-07')).toBeNull();
    expect(formatLastPerformance(null)).toBe('No prior log');
  });

  it('formats bodyweight work and builds a per-exercise map', () => {
    const pull = completeSession('D', '2026-08-28', 'pull_up', [{ weight_kg: 0, reps: 6 }]);
    expect(formatLastPerformance(lastMatchingPerformance([pull], 'pull_up', 'D', '2026-09-04'))).toBe(
      'Last: BW × 6',
    );
    const plank = completeSession('A', '2026-08-31', 'plank', [{ weight_kg: 0, reps: 60 }]);
    expect(formatLastPerformance(lastMatchingPerformance([plank], 'plank', 'A', '2026-09-07'))).toBe(
      'Last: BW × 60s',
    );
    const map = lastPerformanceByExercise([pull], 'D', '2026-09-04', ['pull_up', 'curl_db']);
    expect(map.get('pull_up')?.reps).toBe(6);
    expect(map.get('curl_db')).toBeNull();
  });

  it('names the accessory implement on last-week copy, not on T1 squat', () => {
    const row = completeSession('B', '2026-09-01', 'row_barbell', [{ weight_kg: 40, reps: 8 }]);
    expect(formatLastPerformance(lastMatchingPerformance([row], 'row_barbell', 'B', '2026-09-08'))).toBe(
      'Last: 40 kg × 8 · Barbell',
    );
    const squat = completeSession('A', '2026-08-31', 'squat_low_bar', [{ weight_kg: 50, reps: 5 }]);
    expect(formatLastPerformance(lastMatchingPerformance([squat], 'squat_low_bar', 'A', '2026-09-07'))).toBe(
      'Last: 50 kg × 5',
    );
    const cable = completeSession('D', '2026-08-28', 'tricep_pushdown_cable', [{ weight_kg: 12.5, reps: 12 }]);
    expect(
      formatLastPerformance(lastMatchingPerformance([cable], 'tricep_pushdown_cable', 'D', '2026-09-04')),
    ).toBe('Last: 12.5 kg × 12 · Cable');
  });

  it('does not treat a historical band pushdown as last performance for the cable id', () => {
    const draft = createDraftSession('D', '2026-08-28');
    const triIndex = draft.lifts.findIndex((row) => row.exercise_id === 'tricep_pushdown_cable');
    if (triIndex < 0) throw new Error('missing tricep slot');
    const swapped = swapLiftExercise(draft, triIndex, 'tricep_pushdown_band');
    swapped.status = 'complete';
    const lift = swapped.lifts[triIndex];
    lift.sets = [{ weight_kg: 0, reps: 12, rpe: 8, completed: true }];
    expect(lastMatchingPerformance([swapped], 'tricep_pushdown_cable', 'D', '2026-09-04')).toBeNull();
    expect(lastMatchingPerformance([swapped], 'tricep_pushdown_band', 'D', '2026-09-04')).toMatchObject({
      exercise_id: 'tricep_pushdown_band',
      weight_kg: 0,
      reps: 12,
    });
  });
});
