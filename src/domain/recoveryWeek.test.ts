import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { createDraftSession } from './sessionFactory';
import { buildSessionBackup, parseSessionBackupJson } from './sessionBackup';
import { calendarTemplateDay, defaultTemplateDayForDate } from './templateDay';
import { buildBlockPreview } from './blockPreview';
import { blockPrescription } from './cyclePlan';
import { dashboardTimeline, eligibleEstimates, sessionCompletion, thisWeekTargets } from './dashboard';
import { dayTemplateForDate, isDeloadWeek, isRecoveryWeek, t1PrescriptionFor } from './programWeek';
import { plannedDayPreview } from './workoutPreview';
import {
  RECOVERY_BENCH_ALT,
  RECOVERY_DAILY_NOTE,
  RECOVERY_DAY_D_ALT,
  RECOVERY_DL_CUES,
  RECOVERY_RULE,
} from './recoveryWeek';
import type { CanonicalTemplateDay, SessionLog } from '../types/session';

const BANNED = ['squat_low_bar', 'rdl', 'hip_thrust', 'plank', 'bench_regular'] as const;

function ids(day: CanonicalTemplateDay, date: string): string[] {
  return dayTemplateForDate(day, date).slots.map((slot) => slot.exercise_id);
}

function loggedRecoveryDeadlift(): SessionLog {
  const draft = createDraftSession('D', '2026-10-30');
  draft.status = 'complete';
  for (const set of draft.lifts[0]?.sets ?? []) {
    set.completed = true;
    set.rpe = 6;
  }
  return draft;
}

describe('Block B week 4 recovery', () => {
  it('replaces only B4 and leaves the following week on the C1 table', () => {
    expect(isRecoveryWeek('2026-10-26')).toBe(true);
    expect(isRecoveryWeek('2026-11-01')).toBe(true);
    expect(isRecoveryWeek('2026-10-25')).toBe(false);
    expect(isRecoveryWeek('2026-11-02')).toBe(false);
    expect(isDeloadWeek('2026-10-27')).toBe(false);
    expect(isDeloadWeek('2026-09-28')).toBe(true);
    expect(t1PrescriptionFor('A', '2026-10-26')).toBeNull();
    expect(blockPrescription('B', 4, 'A')).toBeNull();
    expect(blockPrescription('B', 5, 'A')).toBeNull();
    expect(blockPrescription('B', 3, 'A')?.weight_kg).toBe(65);
    expect(t1PrescriptionFor('A', '2026-11-02')).toMatchObject({ weight_kg: 67.5, set_count: 3 });
    expect(plannedDayPreview(DAY_TEMPLATES.A, [], '2026-11-02').slice(0, 2).map((row) => row.workLabel)).toEqual([
      '67.5 kg × 1 then 60 kg × 2 × 2',
      '55 kg · 1 × 5',
    ]);
  });

  it('marks Monday 26 Oct as rest and keeps Tue Thu Fri as training days', () => {
    expect(calendarTemplateDay('2026-10-26')).toBe('rest');
    expect(defaultTemplateDayForDate('2026-10-26')).toBeNull();
    expect(defaultTemplateDayForDate('2026-10-27')).toBe('B');
    expect(calendarTemplateDay('2026-10-28')).toBe('rest');
    expect(defaultTemplateDayForDate('2026-10-29')).toBe('C');
    expect(defaultTemplateDayForDate('2026-10-30')).toBe('D');
    expect(dayTemplateForDate('A', '2026-10-27').slots).toHaveLength(0);
    expect(dayTemplateForDate('A', '2026-10-27').title).toBe('Skipped · walk only');
    expect(sessionCompletion([], '2026-10-26')).toMatchObject({
      done: 0,
      total: 3,
      rest: { A: true, B: false, C: false, D: false },
    });
    expect(sessionCompletion([], '2026-10-19').total).toBe(4);
    const targets = thisWeekTargets('2026-10-27');
    expect(targets.find((day) => day.date === '2026-10-26')).toMatchObject({
      heading: 'Mon 26 Oct · skipped',
      note: RECOVERY_DAILY_NOTE,
      lines: [],
    });
    expect(targets.find((day) => day.date === '2026-10-28')?.note).toBe(RECOVERY_DAILY_NOTE);
    expect(targets.find((day) => day.date === '2026-10-27')?.lines.map((line) => line.name)).toContain(
      'Seated single-arm DB press',
    );
    expect(thisWeekTargets('2026-11-02').some((day) => day.lines.some((line) => line.load.includes('67.5')))).toBe(
      true,
    );
    const timeline = dashboardTimeline('2026-10-27').find((week) => week.id === 'B4');
    expect(timeline?.badge).toBe('This week');
    expect(timeline?.note).toContain(RECOVERY_RULE);
    expect(timeline?.note).toContain('not a missed session');
    expect(timeline?.days?.find((day) => day.label === 'Mo')?.kind).toBe('rest');
    expect(timeline?.days?.find((day) => day.label === 'Tu')?.kind).toBe('today');
  });

  it('prescribes Tuesday, Thursday, and Friday and leaves dumbbell loads blank', () => {
    expect(ids('B', '2026-10-27')).toEqual([
      'press_db_seated_single',
      'row_db_chest_single',
      'pull_up_cable',
      'bird_dog',
    ]);
    expect(ids('C', '2026-10-29')).toEqual([
      'press_db_seated_single',
      'row_db_chest_single',
      'band_pull_apart',
      'glute_bridge',
      'dead_bug',
    ]);
    expect(ids('D', '2026-10-30')).toEqual([
      'deadlift_conventional',
      'row_db_chest_single',
      'bird_dog',
    ]);
    for (const [day, date] of [
      ['B', '2026-10-27'],
      ['C', '2026-10-29'],
      ['D', '2026-10-30'],
    ] as const) {
      const slots = dayTemplateForDate(day, date).slots;
      expect(slots.some((slot) => (BANNED as readonly string[]).includes(slot.exercise_id))).toBe(false);
      expect(slots.every((slot) => slot.sets.every((set) => set.rpe_label === '≤6'))).toBe(true);
    }

    const tuesday = plannedDayPreview(DAY_TEMPLATES.B, [], '2026-10-27');
    expect(tuesday.map((row) => row.workLabel)).toEqual([
      'enter kg · 3 × 10 / arm',
      'enter kg · 3 × 10 / arm',
      '15–20 kg assist · 3 × 6–8',
      'BW · 3 × 8 / side',
    ]);
    expect(tuesday[2]?.note).toBe('From a dead hang.');
    expect(tuesday.every((row) => row.sets.every((set) => !set.warmup))).toBe(true);

    const thursday = dayTemplateForDate('C', '2026-10-29');
    expect(thursday.slots[0]?.note).toBe(RECOVERY_BENCH_ALT);
    expect(thursday.slots[0]?.alternatives).toEqual([]);
    expect(thursday.slots.find((slot) => slot.exercise_id === 'glute_bridge')?.sets.map((set) => set.reps)).toEqual([
      12, 12, 12,
    ]);
    expect(thursday.slots.find((slot) => slot.exercise_id === 'band_pull_apart')?.sets.map((set) => set.reps)).toEqual([
      15, 15, 15,
    ]);

    const friday = dayTemplateForDate('D', '2026-10-30');
    const deadlift = friday.slots[0];
    expect(deadlift?.displayName).toBe('Empty-bar deadlift');
    expect(deadlift?.note).toBe(RECOVERY_DL_CUES);
    expect(deadlift?.sets.map((set) => set.weight_kg)).toEqual([20, 20, 20]);
    expect(deadlift?.skipWarmup).toBe(true);
    const open = friday.slots.find((slot) => slot.exercise_id === 'row_db_chest_single');
    expect(open?.sets.every((set) => set.open_load && set.weight_kg === 0)).toBe(true);
    expect(open?.plan_label).toBe('enter kg · 3 × 10 / arm');
  });

  it('shows the rule on training days and the walk note on rest days', () => {
    const week = buildBlockPreview('2026-10-27', []).find((row) => row.id === 'B-4');
    expect(week?.recovery).toBe(true);
    expect(week?.deload).toBe(false);
    const byDate = Object.fromEntries((week?.sessions ?? []).map((session) => [session.date, session]));
    expect(byDate['2026-10-26']?.heading).toContain('Skipped');
    expect(byDate['2026-10-26']?.notes).toEqual([
      RECOVERY_RULE,
      RECOVERY_DAILY_NOTE,
      'Skipped. Walk only. Not a missed session.',
    ]);
    expect(byDate['2026-10-27']?.notes).toEqual([RECOVERY_RULE, RECOVERY_DAILY_NOTE]);
    expect(byDate['2026-10-28']?.notes).toEqual([RECOVERY_DAILY_NOTE]);
    expect(byDate['2026-10-28']?.kind).toBe('rest');
    expect(byDate['2026-10-30']?.notes).toContain(RECOVERY_DAY_D_ALT);
    expect(byDate['2026-10-30']?.notes).toContain(RECOVERY_DAILY_NOTE);
    expect(byDate['2026-11-01']?.notes).toEqual([RECOVERY_DAILY_NOTE]);
    expect(byDate['2026-10-27']?.exercises.map((row) => row.name)).toEqual([
      'Seated single-arm DB press',
      'Chest-supported single-arm DB row',
      'Cable-assisted pull-up',
      'Bird dog',
    ]);
  });

  it('does not feed a logged empty-bar deadlift into e1RM or the next week', () => {
    const recovery = loggedRecoveryDeadlift();
    expect(recovery.counts_toward_tm).toBe(false);
    expect(eligibleEstimates([recovery], 'deadlift')).toEqual([]);
    const counted = { ...recovery, counts_toward_tm: undefined };
    expect(eligibleEstimates([counted], 'deadlift')).toHaveLength(3);

    const next = dayTemplateForDate('C', '2026-11-05', { logs: [recovery], hold: true });
    expect(next.slots[0]?.sets.map((set) => set.weight_kg)).toEqual([87.5, 77.5, 77.5]);
    expect(createDraftSession('B', '2026-10-06').counts_toward_tm).toBeUndefined();

    const draft = createDraftSession('D', '2026-10-30');
    expect(draft.lifts[0]?.sets.some((set) => set.warmup)).toBe(false);
    draft.status = 'complete';
    const parsed = parseSessionBackupJson(JSON.stringify(buildSessionBackup([draft])));
    expect(parsed.sessions[0]?.counts_toward_tm).toBe(false);
    expect(parsed.sessions[0]?.lifts[0]?.sets[0]?.weight_kg).toBe(20);
  });
});
