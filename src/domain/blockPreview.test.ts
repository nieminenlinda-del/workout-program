import { describe, expect, it } from 'vitest';
import { createDraftSession } from './sessionFactory';
import { dayTemplateForDate } from './programWeek';
import { plannedLiftSummary } from './workoutPreview';
import type { CanonicalTemplateDay, SessionLog } from '../types/session';
import {
  buildBlockPreview,
  formatWeekRange,
  formatWorkRpe,
  previewPhaseLabel,
  type BlockPreviewExercise,
} from './blockPreview';

const AS_OF = '2026-09-27';

function loggedSession(day: CanonicalTemplateDay, date: string): SessionLog {
  const draft = createDraftSession(day, date);
  draft.status = 'complete';
  for (const lift of draft.lifts) {
    lift.sets = lift.sets.map((set) => (set.warmup ? set : { ...set, completed: true }));
  }
  return draft;
}

function expectSameTargets(date: string, day: CanonicalTemplateDay, exercises: BlockPreviewExercise[]) {
  const summaries = dayTemplateForDate(day, date).slots.map((slot) => plannedLiftSummary(slot));
  expect(exercises.map((row) => [row.name, row.workLabel, row.rpeLabel])).toEqual(
    summaries.map((row) => [row.name, row.workLabel, formatWorkRpe(row.sets)]),
  );
}

describe('block preview phases and weeks', () => {
  it('maps encoded block phases onto hypertrophy / strength / peak / test', () => {
    expect(previewPhaseLabel('accumulate')).toBe('Hypertrophy');
    expect(previewPhaseLabel('intensify')).toBe('Strength');
    expect(previewPhaseLabel('peak_overreach')).toBe('Peak');
    expect(previewPhaseLabel('peak_taper')).toBe('Peak');
    expect(previewPhaseLabel('test')).toBe('Test');
  });

  it('runs from the current product week through the 21 Nov test', () => {
    const weeks = buildBlockPreview(AS_OF, []);
    expect(weeks.map((week) => week.id)).toEqual([
      'A-3',
      'A-4',
      'B-1',
      'B-2',
      'B-3',
      'B-4',
      'C-1',
      'C-2',
      'C-3',
    ]);
    expect(weeks[0]).toMatchObject({
      label: 'Block A · Week 3',
      start: '2026-09-20',
      end: '2026-09-27',
      rangeLabel: '20–27 Sep',
      phaseLabel: 'Hypertrophy',
      current: true,
      projected: false,
      completed: false,
    });
    expect(weeks[1]).toMatchObject({
      label: 'Block A · Week 4',
      start: '2026-09-28',
      end: '2026-10-04',
      rangeLabel: '28 Sep – 4 Oct',
      phaseLabel: 'Hypertrophy',
      current: false,
      projected: true,
    });
    expect(weeks.find((week) => week.id === 'B-1')?.phaseLabel).toBe('Strength');
    expect(weeks.at(-1)).toMatchObject({
      label: 'Block C · Week 3',
      start: '2026-11-16',
      end: '2026-11-21',
      phaseLabel: 'Peak · Test',
      projected: true,
    });
    expect(formatWeekRange('2026-11-16', '2026-11-21')).toBe('16–21 Nov');
  });

  it('keeps the Kraft trip: Wed C, Thu D, Friday rest', () => {
    const week = buildBlockPreview(AS_OF, [])[0];
    expect(week?.sessions.map((session) => `${session.date} ${session.heading}`)).toEqual([
      '2026-09-21 Mon 21 Sep · Day A',
      '2026-09-22 Tue 22 Sep · Day B',
      '2026-09-23 Wed 23 Sep · Day C',
      '2026-09-24 Thu 24 Sep · Day D',
    ]);
  });
});

describe('block preview loads', () => {
  const weeks = buildBlockPreview(AS_OF, []);

  it('uses the Kraft week-3 targets for the current week', () => {
    const monday = weeks[0]?.sessions[0];
    expect(monday?.exercises[0]).toMatchObject({
      name: 'Low-bar squat',
      workLabel: '60 kg · 3 × 3',
      rpeLabel: 'RPE 7.5, 8, 8',
      projected: false,
    });
    expect(monday?.exercises[0]?.note).toMatch(/Soft-cap ≤8/);
    expect(monday?.exercises[1]?.workLabel).toBe('50 kg · 3 × 8');
    expectSameTargets('2026-09-21', 'A', monday?.exercises ?? []);
    expectSameTargets('2026-09-23', 'C', weeks[0]?.sessions[2]?.exercises ?? []);
    expect(weeks[0]?.sessions[2]?.exercises[0]?.workLabel).toBe('72.5 kg · 3 × 3');
    expect(weeks[0]?.sessions[3]?.exercises[0]?.workLabel).toBe('42.5 kg · 2 × 4');
  });

  it('holds week 3 into Block A week 4 and labels it projected', () => {
    const monday = weeks[1]?.sessions[0];
    expect(monday?.date).toBe('2026-09-28');
    expect(monday?.projected).toBe(true);
    expect(monday?.exercises[0]?.workLabel).toBe('60 kg · 3 × 3');
    expect(monday?.exercises.every((row) => row.projected)).toBe(true);
    expectSameTargets('2026-09-28', 'A', monday?.exercises ?? []);
  });

  it('uses the same seed targets as Today once the Kraft table stops (Block B and C)', () => {
    const blockB = weeks.find((week) => week.id === 'B-1');
    const monday = blockB?.sessions[0];
    expect(monday?.date).toBe('2026-10-05');
    expect(monday?.phaseLabel).toBe('Strength');
    expect(monday?.exercises[0]?.workLabel).toBe('55 kg · 3 × 5');
    expectSameTargets('2026-10-05', 'A', monday?.exercises ?? []);

    const blockC = weeks.find((week) => week.id === 'C-1');
    expectSameTargets('2026-11-02', 'A', blockC?.sessions[0]?.exercises ?? []);
    expect(blockC?.sessions[0]?.phaseLabel).toBe('Peak');
  });

  it('marks only the days after today as projected inside the current week', () => {
    const week = buildBlockPreview('2026-09-23', [])[0];
    expect(week?.current).toBe(true);
    expect(week?.projected).toBe(false);
    expect(week?.sessions.find((session) => session.date === '2026-09-21')?.projected).toBe(false);
    expect(week?.sessions.find((session) => session.date === '2026-09-23')?.projected).toBe(false);
    expect(week?.sessions.find((session) => session.date === '2026-09-24')?.projected).toBe(true);
  });

  it('lists the test protocol without inventing attempt loads', () => {
    const last = weeks.at(-1);
    const taper = last?.sessions.find((session) => session.date === '2026-11-17');
    const test = last?.sessions.find((session) => session.kind === 'test');
    expect(taper?.frozen).toBe(true);
    expect(taper?.phaseLabel).toBe('Peak');
    expect(last?.sessions.find((session) => session.date === '2026-11-16')?.frozen).toBe(false);
    expect(test).toMatchObject({
      date: '2026-11-21',
      heading: 'Sat 21 Nov · 1RM test',
      phaseLabel: 'Test',
      exercises: [],
      projected: true,
    });
    expect(test?.testNote).toMatch(/not programmed/);
    expect(test?.title).toBe('Low-bar squat → Bench press → Conventional deadlift');
  });
});

describe('block preview logged results', () => {
  it('shows logged work and marks the week complete when every session is saved', () => {
    const logs = [
      loggedSession('A', '2026-09-21'),
      loggedSession('B', '2026-09-22'),
      loggedSession('C', '2026-09-23'),
      loggedSession('D', '2026-09-24'),
    ];
    const week = buildBlockPreview(AS_OF, logs)[0];
    expect(week?.completed).toBe(true);
    expect(week?.sessions.every((session) => session.completed)).toBe(true);
    expect(week?.sessions[0]?.logged[0]).toEqual({
      name: 'Low-bar squat',
      line: '60 kg × 3 @ 7.5, 60 kg × 3 @ 8, 60 kg × 3 @ 8',
    });
  });

  it('keeps the week open when a training day has no log', () => {
    const week = buildBlockPreview(AS_OF, [loggedSession('A', '2026-09-21')])[0];
    expect(week?.completed).toBe(false);
    expect(week?.sessions[0]?.completed).toBe(true);
    expect(week?.sessions[1]?.completed).toBe(false);
    expect(week?.sessions[1]?.logged).toEqual([]);
  });

  it('surfaces a logged Sunday trip session the calendar leaves as rest', () => {
    const week = buildBlockPreview(AS_OF, [loggedSession('A', '2026-09-20')])[0];
    expect(week?.sessions[0]).toMatchObject({
      date: '2026-09-20',
      templateDay: 'A',
      heading: 'Sun 20 Sep · Day A',
      completed: true,
    });
    expect(week?.sessions[0]?.exercises[0]?.workLabel).toBe('60 kg · 3 × 3');
    expect(week?.completed).toBe(false);
  });
});
