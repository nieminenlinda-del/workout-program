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
      deload: false,
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
      deload: true,
      current: false,
      projected: true,
    });
    expect(weeks.find((week) => week.id === 'B-4')?.deload).toBe(true);
    expect(weeks.find((week) => week.id === 'B-1')?.deload).toBe(false);
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

  it('uses the Week 4 deload on Block A week 4 and labels it projected', () => {
    const week = weeks[1];
    expect(week?.deload).toBe(true);
    expect(week?.end).toBe('2026-10-04');
    expect(week?.sessions.map((session) => `${session.date} ${session.templateDay}`)).toEqual([
      '2026-09-28 A',
      '2026-09-29 B',
      '2026-10-01 C',
      '2026-10-02 D',
    ]);

    const monday = week?.sessions[0];
    expect(monday?.date).toBe('2026-09-28');
    expect(monday?.projected).toBe(true);
    expect(monday?.exercises[0]).toMatchObject({
      workLabel: '45 kg · 2 × 5',
      rpeLabel: 'RPE 5–6',
      note: 'Deload. RPE 5–6.',
    });
    expect(monday?.exercises[1]?.workLabel).toBe('50 kg · 3 × 8');
    expect(monday?.exercises.every((row) => row.projected)).toBe(true);
    expectSameTargets('2026-09-28', 'A', monday?.exercises ?? []);

    const deadlift = week?.sessions.find((session) => session.date === '2026-10-01');
    expect(deadlift?.exercises[0]).toMatchObject({
      workLabel: '55 kg · 2 × 5',
      rpeLabel: 'RPE 5–6',
    });
    expectSameTargets('2026-09-30', 'C', deadlift?.exercises ?? []);
    expectSameTargets('2026-10-01', 'C', deadlift?.exercises ?? []);
    expect(week?.sessions.find((session) => session.date === '2026-10-02')?.exercises[0]?.workLabel).toBe(
      '32.5 kg · 2 × 5',
    );
  });

  it('uses the Block B and C planned loads, and keeps them projected', () => {
    const blockB = weeks.find((week) => week.id === 'B-1');
    const monday = blockB?.sessions[0];
    expect(monday?.date).toBe('2026-10-05');
    expect(monday?.phaseLabel).toBe('Strength');
    expect(monday?.exercises[0]?.workLabel).toBe('60 kg · 3 × 4');
    expect(monday?.exercises[1]?.workLabel).toBe('50 kg · 3 × 8');
    expectSameTargets('2026-10-05', 'A', monday?.exercises ?? []);

    const blockC = weeks.find((week) => week.id === 'C-1');
    expect(blockC?.sessions[0]?.phaseLabel).toBe('Peak');
    expect(blockC?.sessions[0]?.exercises.map((row) => row.workLabel)).toEqual([
      '67.5 kg × 1 then 60 kg × 2 × 2',
    ]);
    expect(blockC?.sessions[0]?.frozen).toBe(false);
    expectSameTargets('2026-11-02', 'A', blockC?.sessions[0]?.exercises ?? []);
  });

  it('marks only the days after today as projected inside the current week', () => {
    const week = buildBlockPreview('2026-09-23', [])[0];
    expect(week?.current).toBe(true);
    expect(week?.projected).toBe(false);
    expect(week?.sessions.find((session) => session.date === '2026-09-21')?.projected).toBe(false);
    expect(week?.sessions.find((session) => session.date === '2026-09-23')?.projected).toBe(false);
    expect(week?.sessions.find((session) => session.date === '2026-09-24')?.projected).toBe(true);
  });

  it('lists Saturday 21 Nov planned attempts and the frozen test-week sessions', () => {
    const last = weeks.at(-1);
    expect(last?.sessions.map((session) => `${session.date} ${session.heading}`)).toEqual([
      '2026-11-16 Mon 16 Nov · Squat + bench',
      '2026-11-18 Wed 18 Nov · Deadlift + bench',
      '2026-11-21 Sat 21 Nov · 1RM test',
    ]);
    const opener = last?.sessions[0];
    expect(opener?.frozen).toBe(true);
    expect(opener?.phaseLabel).toBe('Peak');
    expect(opener?.exercises.map((row) => row.workLabel)).toEqual(['52.5 kg · 2 × 2', '37.5 kg · 2 × 2']);
    const pull = last?.sessions[1];
    expect(pull?.frozen).toBe(true);
    expect(pull?.exercises.map((row) => row.workLabel)).toEqual(['65 kg · 2 × 2', '40 kg · 2 × 1']);
    const test = last?.sessions.find((session) => session.kind === 'test');
    expect(test).toMatchObject({
      date: '2026-11-21',
      heading: 'Sat 21 Nov · 1RM test',
      phaseLabel: 'Test',
      projected: true,
    });
    expect(test?.exercises.map((row) => row.workLabel)).toEqual([
      'Planned · 70 / 75 / 77.5–80 kg',
      'Planned · 50 / 52.5 / 55–57.5 kg',
      'Planned · 87.5 / 92.5–95 / 97.5–100 kg',
    ]);
    expect(test?.testNote).toMatch(/Planned attempts/);
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
