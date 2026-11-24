import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../db/memoryRepository';
import { withComputedLight } from './readiness';
import { DEFAULT_READINESS, type LoggedLift, type SessionDraft } from '../types/session';
import {
  NOV23_REPAIR_MARKER,
  NOV23_SESSION_ID,
  helsinkiCalendarDay,
  isNov23DayA,
  nov23DayASession,
  nov23DiagnosticsJson,
  nov23RepairMarkerValue,
  repairNov23Session,
  seedNov23Session,
} from './nov23Session';

function phoneSession(): SessionDraft {
  return {
    session_id: 'phone-uuid-23',
    // 00:30 in Helsinki on 23 Nov 2026. The UTC calendar day is still the 22nd.
    date: '2026-11-22T22:30:00.000Z',
    template_day: 'Monday · Squat' as SessionDraft['template_day'],
    readiness: withComputedLight(DEFAULT_READINESS),
    pain_flag: false,
    pain_note: '',
    notes: 'felt heavy',
    status: 'complete',
    updated_at: '2026-11-23T04:10:00.000Z',
    lifts: [
      {
        name: 'Back squat',
        exercise_id: 'back_squat' as LoggedLift['exercise_id'],
        sets: [
          { weight_kg: 55, reps: 5, rpe: 8, completed: true, amrap: false },
          { weight_kg: 55, reps: 5, rpe: 8.5, completed: true, amrap: false },
          { weight_kg: 55, reps: 5, rpe: 9, completed: true, amrap: false },
        ],
      } as LoggedLift,
    ],
  };
}

describe('Mon 23 Nov repair', () => {
  beforeEach(() => {
    localStorage.removeItem(NOV23_REPAIR_MARKER);
    sessionStorage.clear();
  });

  it('misses a Helsinki Monday that is not template A, then repairs it once', async () => {
    const stored = phoneSession();
    expect(helsinkiCalendarDay(stored.date)).toBe('2026-11-23');
    expect(isNov23DayA(stored)).toBe(false);

    const repo = createMemoryRepository([stored, nov23DayASession()]);
    await repo.saveDraft({ ...stored, status: 'draft' });
    expect(await repairNov23Session(repo)).toBe('repaired');
    expect(nov23RepairMarkerValue()).toBeTruthy();

    const rows = await repo.listAllComplete();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.session_id).toBe('phone-uuid-23');
    expect(rows[0]?.date).toBe('2026-11-23');
    expect(rows[0]?.template_day).toBe('A');
    expect(rows[0]?.lifts.map((lift) => lift.name)).toEqual([
      'Low-bar squat',
      'Paused squat (2 s pause)',
      'Bench press',
      'Ab rollout from knees',
    ]);
    expect(rows[0]?.lifts[0]?.sets.map((set) => set.rpe)).toEqual([8, 8.5, 8.5]);
    expect(rows[0]?.lifts[0]?.sets[2]?.part_label).toBe('Belt');
    expect(rows[0]?.lifts[1]?.sets.every((set) => set.rpe == null && set.weight_kg === 45 && set.reps === 3)).toBe(
      true,
    );
    expect(rows[0]?.lifts[2]?.sets.map((set) => [set.weight_kg, set.reps, set.rpe])).toEqual([
      [45, 4, undefined],
      [45, 4, undefined],
      [45, 4, undefined],
    ]);
    expect(rows[0]?.lifts[3]?.sets.every((set) => set.weight_kg === 0 && set.reps === 8 && set.rpe == null)).toBe(true);
    expect(rows[0]?.notes).toMatch(/felt heavy/);
    expect(rows[0]?.notes).toMatch(/knee sleeves/i);
    expect(await repo.getDraft()).toBeUndefined();

    expect(await seedNov23Session(repo)).toBe('already');
    expect(await repo.listAllComplete()).toHaveLength(1);

    const dumped = JSON.parse(await nov23DiagnosticsJson(repo));
    expect(JSON.stringify(dumped.seenBeforeRepair)).toMatch(/Back squat/);
    expect(dumped.sessions).toHaveLength(1);
    expect(dumped.sessions[0].session_id).not.toBe(NOV23_SESSION_ID);
  });

  it('does not set the marker or delete the old row when the write does not stick', async () => {
    const stored = phoneSession();
    const repo = createMemoryRepository([stored]);
    repo.save = async () => undefined;
    expect(await repairNov23Session(repo)).toBe('unverified');
    expect(localStorage.getItem(NOV23_REPAIR_MARKER)).toBeNull();
    const rows = await repo.listAllComplete();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lifts).toHaveLength(1);
    expect(rows[0]?.lifts[0]?.name).toBe('Back squat');
    expect(rows[0]?.notes).toBe('felt heavy');
  });
});
