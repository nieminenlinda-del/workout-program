import { describe, expect, it } from 'vitest';
import { BLOCK_B_TRAINING_MAXES, TESTED_1RM } from '../types/phase2';
import type { LoggedLift, LoggedSet, SessionLog } from '../types/session';
import { DEFAULT_READINESS } from '../types/session';
import { PLANNED_ATTEMPT_LABELS } from './cyclePlan';
import {
  TEST_BACKUP_DATE,
  attemptMarksFor,
  dashboardTimeline,
  daysUntil,
  eligibleEstimates,
  epley1rm,
  estimate1rm,
  hardSetsInWeek,
  isBackoffSet,
  isEligibleEstimateSet,
  latestSquatBar,
  marksFromAttemptLabel,
  painEntries,
  readinessForWeek,
  rollingTwoWeekBest,
  rtsPercent,
  sameLoadSeries,
  sessionCompletion,
  testedKg,
  thisWeekTargets,
  trainingMaxesAreSeparate,
} from './dashboard';
import { testWeekRole } from './testWeek';

function set(partial: Partial<LoggedSet> & Pick<LoggedSet, 'weight_kg' | 'reps'>): LoggedSet {
  return {
    rpe: 8,
    completed: true,
    ...partial,
  };
}

function lift(partial: Partial<LoggedLift> & Pick<LoggedLift, 'exercise_id' | 'sets'>): LoggedLift {
  return {
    name: partial.exercise_id,
    ...partial,
  };
}

function session(
  date: string,
  day: SessionLog['template_day'],
  lifts: LoggedLift[],
  extra: Partial<SessionLog> = {},
): SessionLog {
  return {
    session_id: `s-${date}-${day}`,
    date,
    template_day: day,
    readiness: { ...DEFAULT_READINESS, light: 'GREEN' },
    lifts,
    pain_flag: false,
    notes: '',
    ...extra,
  };
}

describe('RTS and Epley', () => {
  it('reads the Tuchscherer chart for 4 reps at RPE 7', () => {
    expect(rtsPercent(4, 7)).toBe(81.1);
    expect(estimate1rm(set({ weight_kg: 57.5, reps: 4, rpe: 7 }))).toBeCloseTo(57.5 / 0.811, 5);
  });

  it('uses Epley only when a short set has no RPE', () => {
    const bare = { weight_kg: 100, reps: 5, rpe: undefined as unknown as number };
    expect(estimate1rm(bare)).toBeCloseTo(epley1rm(100, 5), 5);
    expect(epley1rm(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 5);
  });

  it('skips RPE below 6 and sets longer than 5', () => {
    expect(estimate1rm(set({ weight_kg: 60, reps: 5, rpe: 5 }))).toBeNull();
    expect(estimate1rm(set({ weight_kg: 60, reps: 8, rpe: 8 }))).toBeNull();
  });
});

describe('top-set filter', () => {
  const squat = lift({
    exercise_id: 'squat_low_bar',
    sets: [set({ weight_kg: 65, reps: 2, rpe: 8 })],
  });

  it('keeps a competition top set', () => {
    expect(isEligibleEstimateSet(squat, squat.sets[0])).toBe(true);
  });

  it('drops warmups, back-offs, and long AMRAPs', () => {
    expect(isBackoffSet(set({ weight_kg: 55, reps: 5, part_label: 'B1' }))).toBe(true);
    expect(isBackoffSet(set({ weight_kg: 55, reps: 5, part_label: 'Backoff' }))).toBe(true);
    expect(isBackoffSet(set({ weight_kg: 65, reps: 2, part_label: 'Top' }))).toBe(false);
    const warmup = set({ weight_kg: 20, reps: 5, warmup: true, rpe: 5 });
    const backoff = set({ weight_kg: 55, reps: 5, part_label: 'B2', rpe: 7 });
    const amrap = set({ weight_kg: 50, reps: 8, amrap: true, rpe: 10 });
    expect(isEligibleEstimateSet(squat, warmup)).toBe(false);
    expect(isEligibleEstimateSet(squat, backoff)).toBe(false);
    expect(isEligibleEstimateSet(squat, amrap)).toBe(false);
    expect(isEligibleEstimateSet(squat, set({ weight_kg: 70, reps: 3, amrap: true, rpe: 9 }))).toBe(true);
  });

  it('drops paused deadlift, close-grip, paused bench, and high-bar', () => {
    const pausedDl = lift({
      exercise_id: 'deadlift_paused',
      sets: [set({ weight_kg: 80, reps: 2, rpe: 8 })],
    });
    const close = lift({
      exercise_id: 'bench_close_grip',
      sets: [set({ weight_kg: 40, reps: 3, rpe: 8 })],
    });
    const pausedBench = lift({
      exercise_id: 'bench_regular',
      slot_id: 'c-paused-bench',
      sets: [set({ weight_kg: 35, reps: 3, rpe: 8 })],
    });
    const highBar = lift({
      exercise_id: 'squat_low_bar',
      bar_position: 'high_bar',
      sets: [set({ weight_kg: 60, reps: 3, rpe: 8 })],
    });
    expect(isEligibleEstimateSet(pausedDl, pausedDl.sets[0])).toBe(false);
    expect(isEligibleEstimateSet(close, close.sets[0])).toBe(false);
    expect(isEligibleEstimateSet(pausedBench, pausedBench.sets[0])).toBe(false);
    expect(isEligibleEstimateSet(highBar, highBar.sets[0])).toBe(false);
  });
});

describe('rolling two-week window', () => {
  it('keeps a set for the next week and drops it the week after', () => {
    const logs = [
      session('2026-09-14', 'A', [
        lift({
          exercise_id: 'squat_low_bar',
          sets: [set({ weight_kg: 57.5, reps: 4, rpe: 7 })],
        }),
      ]),
    ];
    const points = rollingTwoWeekBest(logs, 'squat', '2026-09-28');
    expect(points.map((point) => point.week)).toEqual(['2026-09-14', '2026-09-21']);
    expect(points[0]?.estimate).toBeCloseTo(57.5 / 0.811, 5);
    expect(eligibleEstimates(logs, 'bench')).toEqual([]);
  });
});

describe('week metrics', () => {
  const logs = [
    session('2026-10-19', 'A', [
      lift({
        exercise_id: 'squat_low_bar',
        sets: [
          set({ weight_kg: 20, reps: 5, rpe: 5, warmup: true }),
          set({ weight_kg: 65, reps: 2, rpe: 8, part_label: 'Top' }),
          set({ weight_kg: 65, reps: 2, rpe: 8, part_label: 'Top' }),
          set({ weight_kg: 65, reps: 2, rpe: 7.5, part_label: 'Top' }),
          set({ weight_kg: 55, reps: 5, rpe: 7, part_label: 'B1' }),
          set({ weight_kg: 55, reps: 5, rpe: 6, part_label: 'B2' }),
        ],
      }),
    ], { readiness: { ...DEFAULT_READINESS, light: 'YELLOW' } }),
    session('2026-10-19', 'A', [
      lift({
        exercise_id: 'squat_low_bar',
        sets: [set({ weight_kg: 60, reps: 2, rpe: 9 })],
      }),
    ]),
  ];

  it('counts hard sets with back-offs and without warmups', () => {
    const counts = hardSetsInWeek(logs, '2026-10-19');
    expect(counts.squat).toBe(5);
    expect(counts.bench).toBe(0);
    expect(counts.deadlift).toBe(0);
  });

  it('counts a repeated template day once toward x/4', () => {
    expect(sessionCompletion(logs, '2026-10-19')).toMatchObject({ done: 1, total: 4, days: { A: true, B: false } });
  });

  it('reads the readiness colour for a logged day', () => {
    const days = readinessForWeek([logs[0]!], '2026-10-19', '2026-10-20');
    const monday = days.find((day) => day.date === '2026-10-19');
    const tuesday = days.find((day) => day.date === '2026-10-20');
    expect(monday?.light).toBe('YELLOW');
    expect(tuesday?.light).toBeNull();
    expect(tuesday?.isToday).toBe(true);
  });
});

describe('same-load RPE', () => {
  it('follows top-set RPE at the repeated weight', () => {
    const logs = [
      session('2026-09-22', 'B', [
        lift({ exercise_id: 'bench_regular', sets: [set({ weight_kg: 42.5, reps: 4, rpe: 8 })] }),
      ]),
      session('2026-10-06', 'B', [
        lift({ exercise_id: 'bench_regular', sets: [set({ weight_kg: 42.5, reps: 5, rpe: 7 })] }),
      ]),
      session('2026-10-13', 'B', [
        lift({
          exercise_id: 'bench_regular',
          sets: [
            set({ weight_kg: 45, reps: 3, rpe: 8 }),
            set({ weight_kg: 37.5, reps: 6, rpe: 7, part_label: 'B1' }),
          ],
        }),
      ]),
    ];
    expect(sameLoadSeries(logs)).toEqual({
      lift: 'bench',
      weight_kg: 42.5,
      points: [
        { date: '2026-09-22', rpe: 8 },
        { date: '2026-10-06', rpe: 7 },
      ],
    });
  });
});

describe('tested maxes, goals, and the dashboard calendar', () => {
  it('keeps tested 1RMs apart from training maxes', () => {
    expect(TESTED_1RM).toEqual({ squat_kg: 75, bench_kg: 55, deadlift_kg: 95 });
    expect(BLOCK_B_TRAINING_MAXES.bench_kg).toBe(52.5);
    expect(trainingMaxesAreSeparate()).toBe(true);
    expect(testedKg('bench')).toBe(55);
  });

  it('reads openers and goal bands from the planned attempts', () => {
    expect(marksFromAttemptLabel(PLANNED_ATTEMPT_LABELS.squat)).toEqual({
      opener: 70,
      goalLow: 77.5,
      goalHigh: 80,
    });
    expect(attemptMarksFor('bench')).toEqual({ opener: 50, goalLow: 55, goalHigh: 57.5 });
    expect(attemptMarksFor('deadlift')).toEqual({ opener: 87.5, goalLow: 97.5, goalHigh: 100 });
  });

  it('lists the backup Saturday and the December meets without changing test week', () => {
    expect(testWeekRole(TEST_BACKUP_DATE)).toBeNull();
    expect(testWeekRole('2026-11-20')).toBe('test');
    const weeks = dashboardTimeline('2026-10-20');
    expect(weeks.map((week) => week.id)).toEqual(['B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'Test', 'Next']);
    expect(weeks.find((week) => week.id === 'B3')?.badge).toBe('This week');
    expect(weeks.find((week) => week.id === 'B4')?.badge).toBe('Deload');
    const test = weeks.find((week) => week.id === 'Test');
    expect(test?.lines.some((line) => line.includes('21 Nov') && line.includes('backup'))).toBe(true);
    const next = weeks.find((week) => week.id === 'Next');
    expect(next?.lines.join(' ')).toMatch(/FPO Tampere/);
    expect(next?.lines.join(' ')).toMatch(/WPC Laitila/);
    expect(daysUntil('2026-10-20', '2026-11-20')).toBe(31);
  });

  it('shows the B3 coach targets for the week of 19 Oct', () => {
    const days = thisWeekTargets('2026-10-20');
    const text = days.flatMap((day) => day.lines.map((line) => line.load)).join(' | ');
    expect(text).toContain('65 kg');
    expect(text).toContain('55 kg');
    expect(text).toContain('47.5 kg');
    expect(text).toContain('82.5 kg');
  });
});

describe('pain area and squat bar', () => {
  it('lists pain areas and the latest squat bar', () => {
    const logs = [
      session('2026-10-06', 'B', [lift({ exercise_id: 'bench_regular', sets: [set({ weight_kg: 40, reps: 5 })] })], {
        pain_flag: true,
        pain_area: 'right_shoulder',
        pain_note: 'Pinch at the bottom.',
      }),
      session('2026-10-19', 'A', [
        lift({ exercise_id: 'squat_low_bar', bar_position: 'high_bar', sets: [set({ weight_kg: 60, reps: 3 })] }),
      ]),
      session('2026-09-14', 'A', [
        lift({ exercise_id: 'squat_low_bar', sets: [set({ weight_kg: 57.5, reps: 4, rpe: 7 })] }),
      ]),
    ];
    expect(painEntries(logs)).toEqual([
      {
        date: '2026-10-06',
        area: 'right_shoulder',
        label: 'Right shoulder',
        note: 'Pinch at the bottom.',
      },
    ]);
    expect(latestSquatBar(logs)).toEqual({ date: '2026-10-19', position: 'high_bar' });
    expect(latestSquatBar(logs.slice(2))).toEqual({ date: '2026-09-14', position: 'low_bar' });
  });
});
