import { describe, expect, it } from 'vitest';
import { createDraftSession, swapLiftExercise } from './sessionFactory';
import {
  calendarYmd,
  formatLastPerformance,
  lastMatchingPerformance,
  lastPerformanceByExercise,
  slotFamilyIds,
  topWorkSet,
} from './lastPerformance';
import type { ExerciseId } from '../types/exercises';
import type { SessionLog } from '../types/session';
import { createMemoryRepository } from '../db/memoryRepository';
import { isWarmupSet } from './sets';

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
    const weightedPlank = completeSession('A', '2026-08-31', 'plank', [{ weight_kg: 5, reps: 60 }]);
    expect(
      formatLastPerformance(lastMatchingPerformance([weightedPlank], 'plank', 'A', '2026-09-07')),
    ).toBe('Last: 5 kg × 60s');
    const map = lastPerformanceByExercise([pull], 'D', '2026-09-04', ['pull_up', 'curl_db']);
    expect(map.get('pull_up')?.reps).toBe(6);
    expect(map.get('curl_db')).toBeNull();
  });

  it('formats cable-assisted pull-ups as assist kg and picks the least assistance', () => {
    expect(
      topWorkSet(
        [
          { weight_kg: 10, reps: 6, rpe: 7, completed: true },
          { weight_kg: 15, reps: 6, rpe: 7, completed: true },
          { weight_kg: 15, reps: 6, rpe: 8, completed: true },
        ],
        true,
      ),
    ).toMatchObject({ weight_kg: 10, reps: 6 });

    const draft = createDraftSession('D', '2026-08-28');
    const idx = draft.lifts.findIndex((row) => row.exercise_id === 'pull_up');
    if (idx < 0) throw new Error('missing pull-up');
    const swapped = swapLiftExercise(draft, idx, 'pull_up_cable');
    swapped.status = 'complete';
    swapped.lifts[idx].sets = [
      { weight_kg: 10, reps: 6, rpe: 7, completed: true, amrap: true },
      { weight_kg: 15, reps: 6, rpe: 7, completed: true, amrap: true },
      { weight_kg: 15, reps: 6, rpe: 8, completed: true, amrap: true },
    ];
    const last = lastMatchingPerformance([swapped], 'pull_up', 'D', '2026-09-04');
    expect(last).toMatchObject({
      exercise_id: 'pull_up_cable',
      weight_kg: 10,
      reps: 6,
      equipment: 'cable',
    });
    expect(formatLastPerformance(last)).toBe('Last: 10 kg assist × 6 · Cable');

    const unassisted = completeSession('D', '2026-08-21', 'pull_up', [{ weight_kg: 0, reps: 4 }]);
    expect(
      formatLastPerformance(lastMatchingPerformance([unassisted], 'pull_up', 'D', '2026-08-28')),
    ).toBe('Last: BW × 4');
    const weighted = completeSession('D', '2026-08-14', 'pull_up', [{ weight_kg: 5, reps: 3 }]);
    expect(
      formatLastPerformance(lastMatchingPerformance([weighted], 'pull_up', 'D', '2026-08-21')),
    ).toBe('Last: 5 kg × 3');
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
    const cable = completeSession('D', '2026-08-28', 'cable_rope_pushdown', [{ weight_kg: 12.5, reps: 12 }]);
    expect(
      formatLastPerformance(lastMatchingPerformance([cable], 'cable_rope_pushdown', 'D', '2026-09-04')),
    ).toBe('Last: 12.5 kg × 12 · Cable');
    const lunge = completeSession('A', '2026-09-14', 'reverse_lunge', [{ weight_kg: 37.5, reps: 8 }]);
    expect(formatLastPerformance(lastMatchingPerformance([lunge], 'reverse_lunge', 'A', '2026-09-21'))).toBe(
      'Last: 37.5 kg × 8 · Barbell',
    );
    expect(formatLastPerformance(lastMatchingPerformance([lunge], 'goblet_squat', 'A', '2026-09-21'))).toBe(
      'Last: 37.5 kg × 8 · Barbell',
    );
  });

  it('falls back to the same slot family so a band (or BW) log is last week for cable', () => {
    const draft = createDraftSession('D', '2026-09-11');
    const triIndex = draft.lifts.findIndex((row) => row.exercise_id === 'cable_rope_pushdown');
    if (triIndex < 0) throw new Error('missing tricep slot');
    const swapped = swapLiftExercise(draft, triIndex, 'tricep_pushdown_band');
    swapped.status = 'complete';
    const lift = swapped.lifts[triIndex];
    lift.sets = [{ weight_kg: 0, reps: 12, rpe: 8, completed: true }];
    expect(slotFamilyIds('cable_rope_pushdown', 'D')).toEqual([
      'cable_rope_pushdown',
      'tricep_pushdown_band',
    ]);
    const fromBand = lastMatchingPerformance([swapped], 'cable_rope_pushdown', 'D', '2026-09-14');
    expect(fromBand).toMatchObject({
      exercise_id: 'tricep_pushdown_band',
      weight_kg: 0,
      reps: 12,
      date: '2026-09-11',
    });
    expect(formatLastPerformance(fromBand)).toBe('Last: BW × 12 · Bands');
    expect(lastMatchingPerformance([swapped], 'tricep_pushdown_band', 'D', '2026-09-14')).toMatchObject({
      exercise_id: 'tricep_pushdown_band',
      weight_kg: 0,
      reps: 12,
    });
  });

  it('prefers an exact-id match over a slot alternative in the same session', () => {
    const draft = createDraftSession('B', '2026-09-08');
    const row = draft.lifts.find((lift) => lift.exercise_id === 'row_barbell');
    if (!row) throw new Error('missing row');
    row.sets = [
      { weight_kg: 40, reps: 8, rpe: 8, completed: true },
      { weight_kg: 0, reps: 10, rpe: 8, completed: true },
    ];
    draft.lifts.push({
      name: 'DB row',
      exercise_id: 'row_db',
      equipment: 'dumbbells',
      sets: [{ weight_kg: 16, reps: 10, rpe: 8, completed: true }],
    });
    draft.status = 'complete';
    expect(lastMatchingPerformance([draft], 'row_barbell', 'B', '2026-09-15')).toMatchObject({
      exercise_id: 'row_barbell',
      weight_kg: 40,
      reps: 8,
    });
  });
});

function completeAllWorkSets(day: 'A' | 'B' | 'C' | 'D', date: string): SessionLog {
  const draft = createDraftSession(day, date);
  draft.status = 'complete';
  for (const lift of draft.lifts) {
    lift.sets = lift.sets.map((set) =>
      isWarmupSet(set) ? set : { ...set, completed: true },
    );
  }
  return draft;
}

describe('week 1 logs are last week for week 2', () => {
  const week1 = [
    completeAllWorkSets('A', '2026-09-07'),
    completeAllWorkSets('B', '2026-09-08'),
    completeAllWorkSets('C', '2026-09-10'),
    completeAllWorkSets('D', '2026-09-11'),
  ];

  it('shows squat / bench / deadlift / accessories on a Week 2 Day A draft (Mon 14th)', () => {
    const squat = lastMatchingPerformance(week1, 'squat_low_bar', 'A', '2026-09-14');
    expect(squat).toMatchObject({ date: '2026-09-07', weight_kg: 47.5, reps: 5, template_day: 'A' });
    expect(formatLastPerformance(squat)).toBe('Last: 47.5 kg × 5');

    expect(lastMatchingPerformance(week1, 'rdl', 'A', '2026-09-14')).toMatchObject({
      date: '2026-09-07',
      weight_kg: 50,
      reps: 8,
    });
    expect(lastMatchingPerformance(week1, 'reverse_lunge', 'A', '2026-09-14')).toMatchObject({
      date: '2026-09-07',
      weight_kg: 37.5,
      reps: 8,
      equipment: 'barbell',
    });
    expect(formatLastPerformance(lastMatchingPerformance(week1, 'reverse_lunge', 'A', '2026-09-14'))).toBe(
      'Last: 37.5 kg × 8 · Barbell',
    );
    expect(formatLastPerformance(lastMatchingPerformance(week1, 'plank', 'A', '2026-09-14'))).toBe(
      'Last: BW × 60s',
    );

    expect(lastMatchingPerformance(week1, 'bench_regular', 'B', '2026-09-14')).toMatchObject({
      date: '2026-09-08',
      weight_kg: 40,
    });
    expect(lastMatchingPerformance(week1, 'deadlift_conventional', 'C', '2026-09-14')).toMatchObject({
      date: '2026-09-10',
      weight_kg: 70,
    });
    expect(lastMatchingPerformance(week1, 'cable_rope_pushdown', 'D', '2026-09-14')).toMatchObject({
      date: '2026-09-11',
      weight_kg: 12.5,
      reps: 12,
    });
  });

  it('shows the same Week 1 Last: lines on a Sunday preview (asOf 2026-09-13)', () => {
    expect(lastMatchingPerformance(week1, 'squat_low_bar', 'A', '2026-09-13')).toMatchObject({
      date: '2026-09-07',
      weight_kg: 47.5,
    });
    expect(lastMatchingPerformance(week1, 'bench_regular', 'B', '2026-09-13')).toMatchObject({
      date: '2026-09-08',
      weight_kg: 40,
    });
    expect(lastMatchingPerformance(week1, 'deadlift_conventional', 'C', '2026-09-13')).toMatchObject({
      date: '2026-09-10',
      weight_kg: 70,
    });
    expect(lastMatchingPerformance(week1, 'front_squat_light', 'D', '2026-09-13')).toMatchObject({
      date: '2026-09-11',
      weight_kg: 30,
    });
    expect(lastMatchingPerformance(week1, 'pull_up', 'D', '2026-09-13')).toMatchObject({
      date: '2026-09-11',
      weight_kg: 0,
      reps: 6,
    });
  });

  it('loads Week 1 through listComplete and still matches a Week 2 asOf', async () => {
    const withoutStatus = { ...week1[0] };
    delete (withoutStatus as { status?: string }).status;
    const repo = createMemoryRepository([withoutStatus, week1[1], week1[2], week1[3]]);
    const history = await repo.listComplete(60);
    expect(history).toHaveLength(4);
    expect(lastMatchingPerformance(history, 'squat_low_bar', 'A', '2026-09-14')?.weight_kg).toBe(47.5);
    expect(lastMatchingPerformance(history, 'bench_regular', 'B', '2026-09-14')?.weight_kg).toBe(40);
    expect(lastMatchingPerformance(history, 'deadlift_conventional', 'C', '2026-09-14')?.weight_kg).toBe(
      70,
    );
  });

  it('does not require the prior log to share an ISO week with asOf', () => {
    const ids: ExerciseId[] = ['squat_low_bar', 'rdl', 'reverse_lunge', 'plank'];
    const map = lastPerformanceByExercise(week1, 'A', '2026-09-14', ids);
    for (const id of ids) {
      expect(map.get(id), id).not.toBeNull();
    }
  });

  it('treats missing set.completed as logged (legacy complete rows)', () => {
    const row = completeAllWorkSets('A', '2026-09-07');
    const legacy: SessionLog = {
      session_id: row.session_id,
      date: row.date,
      template_day: row.template_day,
      readiness: row.readiness,
      pain_flag: row.pain_flag,
      notes: row.notes,
      lifts: row.lifts.map((lift) => ({
        ...lift,
        sets: lift.sets.map((set) => {
          const { completed: _completed, ...rest } = set;
          return rest as (typeof lift.sets)[number];
        }),
      })),
    };
    expect(lastMatchingPerformance([legacy], 'squat_low_bar', 'A', '2026-09-14')).toMatchObject({
      date: '2026-09-07',
      weight_kg: 47.5,
      reps: 5,
    });
  });

  it('parses timestamp and unpadded calendar dates', () => {
    expect(calendarYmd('2026-09-07T18:00:00.000Z')).toBe('2026-09-07');
    expect(calendarYmd('2026-9-7')).toBe('2026-09-07');
    expect(calendarYmd('Mon 14 Sep')).toBe('');
  });
});
