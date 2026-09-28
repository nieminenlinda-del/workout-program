import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import type { CanonicalTemplateDay, SessionLog } from '../types/session';
import type { ExerciseId } from '../types/exercises';
import { createDraftSession } from './sessionFactory';
import { dayTemplateForDate } from './programWeek';
import { buildBlockPreview } from './blockPreview';
import { plannedDayPreview } from './workoutPreview';
import {
  accessoryJump,
  accessoryRange,
  droppedWeight,
  inSessionJumpHint,
  stepAccessory,
  type AccessorySetLog,
} from './accessoryProgression';

function fill(count: number, reps: number, rpe: number): AccessorySetLog[] {
  return Array.from({ length: count }, () => ({ reps, rpe }));
}

function loggedAccessory(
  day: CanonicalTemplateDay,
  date: string,
  exerciseId: ExerciseId,
  sets: readonly AccessorySetLog[],
): SessionLog {
  const draft = createDraftSession(day, date);
  draft.status = 'complete';
  const lift = draft.lifts.find((row) => row.exercise_id === exerciseId);
  const work = lift?.sets.filter((set) => !set.warmup) ?? [];
  work.forEach((set, index) => {
    const src = sets[index] ?? sets[sets.length - 1];
    if (!src) return;
    set.completed = true;
    set.reps = src.reps;
    set.rpe = src.rpe;
  });
  return draft;
}

function row(day: CanonicalTemplateDay, date: string, exerciseId: ExerciseId, logs: SessionLog[] = []) {
  return plannedDayPreview(DAY_TEMPLATES[day], logs, date).find((item) => item.exercise_id === exerciseId);
}

describe('accessory double progression', () => {
  it('gives close-grip 6–10, holds 30–60 s, and 8–12 to the other accessories', () => {
    expect(accessoryRange('bench_close_grip')).toEqual({ min: 6, max: 10, unit: 'reps' });
    expect(accessoryRange('plank')).toEqual({ min: 30, max: 60, unit: 'seconds' });
    expect(accessoryRange('side_plank').unit).toBe('seconds');
    expect(accessoryRange('rdl')).toEqual({ min: 8, max: 12, unit: 'reps' });
    expect(accessoryRange('overhead_press')).toEqual({ min: 8, max: 12, unit: 'reps' });
    expect(accessoryRange('band_pull_apart').max).toBe(12);
    expect(accessoryRange('pull_up').min).toBe(8);
    expect(accessoryRange('cable_rope_pushdown').max).toBe(12);
  });

  it('steps each equipment by its smallest jump', () => {
    expect(accessoryJump('rdl')).toEqual({ kind: 'kg', kg: 2.5 });
    expect(accessoryJump('bench_close_grip')).toEqual({ kind: 'kg', kg: 2.5 });
    expect(accessoryJump('curl_db')).toEqual({ kind: 'kg', kg: 2 });
    expect(accessoryJump('cable_rope_pushdown')).toEqual({ kind: 'kg', kg: 2.5 });
    expect(accessoryJump('pull_up_cable')).toEqual({ kind: 'kg', kg: 2.5 });
    expect(accessoryJump('pull_up')).toEqual({ kind: 'reps', reps: 1 });
    expect(accessoryJump('band_pull_apart')).toEqual({ kind: 'reps', reps: 1 });
    expect(accessoryJump('plank')).toEqual({ kind: 'seconds', seconds: 5 });
    expect(droppedWeight(50, 2.5)).toBe(45);
    expect(droppedWeight(40, 2.5)).toBe(37.5);
    expect(droppedWeight(82.5, 2.5)).toBe(77.5);
    expect(droppedWeight(8, 2)).toBe(6);
    expect(droppedWeight(12.5, 2.5)).toBe(10);
    expect(droppedWeight(10, 2.5, true)).toBe(12.5);
  });

  it('adds the load and resets reps when every set hits the top at RPE 7 or lower', () => {
    const close = loggedAccessory('D', '2026-10-09', 'bench_close_grip', fill(3, 10, 7));
    expect(row('D', '2026-10-16', 'bench_close_grip', [close])).toMatchObject({
      workLabel: '42.5 kg · 3 × 6',
      note: '+2.5 kg: all sets 10 @ RPE 7',
    });
    const rdl = loggedAccessory('D', '2026-10-09', 'rdl', fill(4, 12, 7));
    expect(row('D', '2026-10-16', 'rdl', [rdl])).toMatchObject({
      workLabel: '52.5 kg · 4 × 8',
      note: '+2.5 kg: all sets 12 @ RPE 7',
    });
    const curl = loggedAccessory('D', '2026-10-09', 'curl_db', fill(3, 12, 6.5));
    expect(row('D', '2026-10-16', 'curl_db', [curl])).toMatchObject({
      workLabel: '10 kg · 3 × 8',
      note: '+2 kg: all sets 12 @ RPE 6.5',
    });
    const plank = loggedAccessory('A', '2026-10-05', 'plank', fill(4, 60, 7));
    expect(row('A', '2026-10-12', 'plank', [plank])).toMatchObject({
      workLabel: 'BW · 4 × 65s',
      note: '+5 s: all sets 60 @ RPE 7',
    });
    const pull = loggedAccessory('D', '2026-10-09', 'pull_up', fill(4, 12, 7));
    expect(row('D', '2026-10-16', 'pull_up', [pull])).toMatchObject({
      note: '+1 rep: all sets 12 @ RPE 7',
    });
    expect(row('D', '2026-10-16', 'pull_up', [pull])?.workLabel).toContain('13');
  });

  it('adds one rep when every set is inside the range and short of the top', () => {
    const close = loggedAccessory('D', '2026-10-09', 'bench_close_grip', fill(3, 8, 7));
    expect(row('D', '2026-10-16', 'bench_close_grip', [close])).toMatchObject({
      workLabel: '40 kg · 3 × 9',
      note: '+1 rep target',
    });
    const side = loggedAccessory('C', '2026-10-08', 'side_plank', fill(4, 40, 7));
    expect(row('C', '2026-10-15', 'side_plank', [side])?.note).toBe('+1 s target');
  });

  it('holds on a set below the range or at RPE 9, and drops after two misses', () => {
    const low = loggedAccessory('D', '2026-10-09', 'bench_close_grip', [
      { reps: 8, rpe: 7 },
      { reps: 5, rpe: 7 },
      { reps: 8, rpe: 7 },
    ]);
    expect(row('D', '2026-10-16', 'bench_close_grip', [low])).toMatchObject({
      workLabel: '40 kg · 3 × 8',
      note: 'Held: set below range',
    });
    const hard = loggedAccessory('D', '2026-10-09', 'bench_close_grip', fill(3, 8, 9));
    expect(row('D', '2026-10-16', 'bench_close_grip', [hard])).toMatchObject({
      workLabel: '40 kg · 3 × 8',
      note: 'Held: RPE 9',
    });
    const topHeavy = loggedAccessory('D', '2026-10-09', 'bench_close_grip', fill(3, 10, 8));
    expect(row('D', '2026-10-16', 'bench_close_grip', [topHeavy])?.note).toBe('Held: RPE 8');

    const second = loggedAccessory('D', '2026-10-16', 'bench_close_grip', fill(3, 8, 9));
    expect(row('D', '2026-10-23', 'bench_close_grip', [low, second])).toMatchObject({
      workLabel: '37.5 kg · 3 × 6',
      note: 'Reset −7.5%: 2 sessions missed',
    });
  });

  it('suggests the smallest jump for remaining sets when a logged set is under RPE 6', () => {
    expect(inSessionJumpHint('bench_close_grip', 40, 8, [5.5], 2)).toBe(
      'Under RPE 6. Try 42.5 kg on the remaining sets.',
    );
    expect(inSessionJumpHint('curl_db', 8, 12, [5], 1)).toBe('Under RPE 6. Try 10 kg on the remaining sets.');
    expect(inSessionJumpHint('cable_rope_pushdown', 12.5, 12, [5], 1)).toBe(
      'Under RPE 6. Try 15 kg on the remaining sets.',
    );
    expect(inSessionJumpHint('pull_up_cable', 10, 8, [5], 1)).toBe(
      'Under RPE 6. Try 7.5 kg on the remaining sets.',
    );
    expect(inSessionJumpHint('pull_up', 0, 8, [5], 1)).toBe('Under RPE 6. Try 9 reps on the remaining sets.');
    expect(inSessionJumpHint('plank', 0, 60, [5], 1)).toBe('Under RPE 6. Try 65s on the remaining sets.');
    expect(inSessionJumpHint('bench_close_grip', 40, 8, [6], 2)).toBeNull();
    expect(inSessionJumpHint('bench_close_grip', 40, 8, [5], 0)).toBeNull();
  });

  it('leaves the block preview on the seed and does not progress B4 or Block C', () => {
    const rdl = loggedAccessory('D', '2026-10-09', 'rdl', fill(4, 12, 7));
    const preview = buildBlockPreview('2026-10-16', [rdl]).find((week) => week.id === 'B-2');
    const friday = preview?.sessions.find((session) => session.date === '2026-10-16');
    expect(friday?.exercises.find((item) => item.name === 'RDL')).toMatchObject({
      workLabel: '50 kg · 4 × 8',
    });

    const lunge = loggedAccessory('A', '2026-10-19', 'reverse_lunge', fill(4, 12, 7));
    const b4 = dayTemplateForDate('A', '2026-10-26', { logs: [lunge], hold: true });
    expect(b4.slots.find((slot) => slot.slot_id === 'a-leg')?.sets.map((set) => [set.weight_kg, set.reps])).toEqual([
      [37.5, 8],
      [37.5, 8],
    ]);
    const c1 = dayTemplateForDate('C', '2026-11-05', {
      logs: [loggedAccessory('C', '2026-10-22', 'rdl', fill(4, 12, 6))],
      hold: true,
    });
    expect(c1.slots.find((slot) => slot.slot_id === 'c-hinge')?.sets.map((set) => [set.weight_kg, set.reps])).toEqual([
      [40, 8],
      [40, 8],
    ]);
    expect(c1.slots.find((slot) => slot.slot_id === 'c-hinge')?.note).toBeUndefined();
  });

  it('clamps B1–B3 targets into the range and leaves the B4 seed reps alone', () => {
    const press = dayTemplateForDate('B', '2026-10-06').slots.find((slot) => slot.slot_id === 'b-press');
    expect(press?.sets.map((set) => set.reps)).toEqual([8, 8, 8, 8]);
    expect(press?.sets[0]?.weight_kg).toBe(25);
    expect(dayTemplateForDate('B', '2026-10-27').slots.find((slot) => slot.slot_id === 'b-press')?.sets.map((set) => set.reps)).toEqual([
      6, 6,
    ]);

    expect(
      dayTemplateForDate('B', '2026-10-06').slots.find((slot) => slot.slot_id === 'b-upper')?.sets[0]?.reps,
    ).toBe(12);
    expect(
      dayTemplateForDate('B', '2026-10-27').slots.find((slot) => slot.slot_id === 'b-upper')?.sets[0]?.reps,
    ).toBe(15);

    const pull = dayTemplateForDate('D', '2026-10-09').slots.find((slot) => slot.slot_id === 'd-pull');
    expect(pull?.sets.map((set) => set.reps)).toEqual([8, 8, 8, 8]);
    expect(pull?.sets.every((set) => set.amrap)).toBe(true);
    expect(dayTemplateForDate('D', '2026-10-30').slots.find((slot) => slot.slot_id === 'd-pull')?.sets[0]?.reps).toBe(6);

    expect(dayTemplateForDate('C', '2026-10-08').slots.find((slot) => slot.slot_id === 'c-core')?.sets[0]?.reps).toBe(30);
    expect(dayTemplateForDate('C', '2026-10-29').slots.find((slot) => slot.slot_id === 'c-core')?.sets[0]?.reps).toBe(20);
  });

  it('steps a cable accessory by one plate and an assisted cable by taking a plate off', () => {
    const loaded = stepAccessory(
      { weightKg: 12.5, reps: 12, missStreak: 0 },
      fill(3, 12, 7),
      'cable_rope_pushdown',
    );
    expect(loaded.state).toMatchObject({ weightKg: 15, reps: 8, missStreak: 0 });
    expect(loaded.note).toBe('+2.5 kg: all sets 12 @ RPE 7');

    const assisted = stepAccessory({ weightKg: 10, reps: 12, missStreak: 0 }, fill(3, 12, 7), 'pull_up_cable');
    expect(assisted.state.weightKg).toBe(7.5);
    expect(assisted.state.reps).toBe(8);
    expect(assisted.note).toBe('−2.5 kg: all sets 12 @ RPE 7');
  });
});
