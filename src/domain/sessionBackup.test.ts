import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import { createMemoryRepository } from '../db/memoryRepository';
import { createDraftSession } from './sessionFactory';
import { isWarmupSet } from './sets';
import { plannedDayPreview } from './workoutPreview';
import {
  A2HS_EMPTY_STORE_LINE,
  BACKUP_SCHEMA,
  BACKUP_SCHEMA_VERSION,
  buildSessionBackup,
  historyHasMon14DayA,
  historyVisibilityLine,
  importSessionBackup,
  importSessionBackupText,
  lastLogGapLine,
  MON14_DAY_A_DATE,
  MON14_DAY_A_LUNGE_KG,
  MON14_DAY_A_LUNGE_REPS,
  MON14_DAY_A_LUNGE_RPE,
  MON14_DAY_A_NOTES,
  MON14_DAY_A_PLANK_KG,
  MON14_DAY_A_RDL_KG,
  MON14_DAY_A_RDL_REPS,
  MON14_DAY_A_RDL_RPE,
  MON14_DAY_A_SESSION_ID,
  MON14_DAY_A_SQUAT_KG,
  MON14_DAY_A_SQUAT_REPS,
  MON14_DAY_A_SQUAT_RPE,
  mon14DayAReferenceSession,
  parseSessionBackupJson,
  seedMon14DayAReference,
  seedWeek1LastReference,
  sessionBackupFilename,
  week1LastReferenceSessions,
  week1ReferenceSessionId,
} from './sessionBackup';

describe('history visibility copy', () => {
  it('names an empty install and surfaces restore, import, and the home-screen wipe warning', () => {
    const empty = historyVisibilityLine(0);
    expect(empty).toMatch(/Session log empty on this install \(0\)/);
    expect(empty).toMatch(/Restore Week 1 weights/);
    expect(empty).toMatch(/Mon 14 Day A/);
    expect(empty).toMatch(/import session JSON/i);
    expect(empty).toContain(A2HS_EMPTY_STORE_LINE);
    expect(historyVisibilityLine(4)).toBe('Last: from 4 sessions on this install.');
    expect(historyVisibilityLine(1)).toBe('Last: from 1 session on this install.');
  });

  it('explains sessions that exist but have no countable work sets', () => {
    expect(lastLogGapLine(0, 0)).toBeNull();
    expect(lastLogGapLine(3, 2)).toBeNull();
    expect(lastLogGapLine(3, 0)).toBe(
      'Session log has 3 on this install — Last: needs logged work sets (not just saved sessions).',
    );
  });
});

describe('Restore Week 1 weights', () => {
  it('writes known T1s and paints Last: 47.5 kg × 5 on 14 Sep squat without changing W2 loads', async () => {
    const rows = week1LastReferenceSessions();
    expect(rows.map((row) => row.session_id)).toEqual([
      week1ReferenceSessionId('A'),
      week1ReferenceSessionId('B'),
      week1ReferenceSessionId('C'),
      week1ReferenceSessionId('D'),
    ]);
    const squat = rows[0]?.lifts.find((lift) => lift.exercise_id === 'squat_low_bar');
    const squatWork = squat?.sets.filter((set) => !isWarmupSet(set)) ?? [];
    expect(squatWork).toHaveLength(3);
    expect(squatWork.every((set) => set.weight_kg === 47.5 && set.reps === 5 && set.completed)).toBe(
      true,
    );
    expect(rows[0]?.notes).toMatch(/reference/i);
    expect(rows[0]?.notes).toMatch(/placeholders/i);

    const repo = createMemoryRepository();
    expect(await seedWeek1LastReference(repo)).toBe(4);
    const history = await repo.listComplete(60);
    expect(history).toHaveLength(4);

    const preview = plannedDayPreview(DAY_TEMPLATES.A, history, '2026-09-14');
    expect(preview[0]?.workLabel).toBe('57.5 kg · 3 × 4');
    expect(preview[0]?.lastLine).toBe('Last: 47.5 kg × 5');
    expect(preview[1]?.lastLine).toBe('Last: 50 kg × 8 · Barbell');
    expect(preview[2]?.lastLine).toBe('Last: 12 kg × 8 · DBs');
    expect(preview[3]?.lastLine).toBe('Last: BW × 60s');

    expect(
      plannedDayPreview(DAY_TEMPLATES.B, history, '2026-09-14')[0]?.lastLine,
    ).toBe('Last: 40 kg × 5');
    expect(
      plannedDayPreview(DAY_TEMPLATES.C, history, '2026-09-14')[0]?.lastLine,
    ).toBe('Last: 70 kg × 5');
    expect(
      plannedDayPreview(DAY_TEMPLATES.D, history, '2026-09-14')[0]?.lastLine,
    ).toBe('Last: 40 kg × 5');
  });
});

describe('Restore today’s Mon 14 Day A', () => {
  it('writes a reconstructed Day A on 2026-09-14 without changing W2 program loads', async () => {
    const row = mon14DayAReferenceSession();
    expect(row.session_id).toBe(MON14_DAY_A_SESSION_ID);
    expect(row.date).toBe(MON14_DAY_A_DATE);
    expect(row.template_day).toBe('A');
    expect(row.status).toBe('complete');
    expect(row.readiness.light).toBe('GREEN');
    expect(row.notes).toBe(MON14_DAY_A_NOTES);
    expect(row.notes).toMatch(/reference \/ reconstructed/i);
    expect(row.notes).toMatch(/gym-logged/i);
    expect(row.notes).toMatch(/RDL 50×8×3 @6/);
    expect(row.notes).toMatch(/reverse lunge 37\.5×8×3 @7/);
    expect(row.notes).not.toMatch(/placeholders/i);

    const squat = row.lifts.find((lift) => lift.exercise_id === 'squat_low_bar');
    const squatWork = squat?.sets.filter((set) => !isWarmupSet(set)) ?? [];
    expect(squatWork).toHaveLength(3);
    expect(
      squatWork.every(
        (set) =>
          set.weight_kg === MON14_DAY_A_SQUAT_KG &&
          set.reps === MON14_DAY_A_SQUAT_REPS &&
          set.rpe === MON14_DAY_A_SQUAT_RPE &&
          set.completed,
      ),
    ).toBe(true);

    const plank = row.lifts.find((lift) => lift.exercise_id === 'plank');
    const plankWork = plank?.sets.filter((set) => !isWarmupSet(set)) ?? [];
    expect(plankWork.length).toBeGreaterThan(0);
    expect(
      plankWork.every((set) => set.weight_kg === MON14_DAY_A_PLANK_KG && set.reps === 60 && set.completed),
    ).toBe(true);

    const rdl = row.lifts.find((lift) => lift.exercise_id === 'rdl');
    const rdlWork = rdl?.sets.filter((set) => !isWarmupSet(set)) ?? [];
    expect(rdlWork).toHaveLength(3);
    expect(
      rdlWork.every(
        (set) =>
          set.weight_kg === MON14_DAY_A_RDL_KG &&
          set.reps === MON14_DAY_A_RDL_REPS &&
          set.rpe === MON14_DAY_A_RDL_RPE &&
          set.completed,
      ),
    ).toBe(true);

    const lunge = row.lifts.find((lift) => lift.exercise_id === 'reverse_lunge');
    const lungeWork = lunge?.sets.filter((set) => !isWarmupSet(set)) ?? [];
    expect(lungeWork).toHaveLength(3);
    expect(
      lungeWork.every(
        (set) =>
          set.weight_kg === MON14_DAY_A_LUNGE_KG &&
          set.reps === MON14_DAY_A_LUNGE_REPS &&
          set.rpe === MON14_DAY_A_LUNGE_RPE &&
          set.completed,
      ),
    ).toBe(true);

    const hingeSlot = DAY_TEMPLATES.A.slots.find((slot) => slot.exercise_id === 'rdl');
    expect(hingeSlot?.sets.map((set) => set.rpe)).toEqual([7, 7, 7.5]);
    const lungeSlot = DAY_TEMPLATES.A.slots.find((slot) => slot.exercise_id === 'reverse_lunge');
    expect(lungeSlot?.sets.every((set) => set.weight_kg === 12 && set.reps === 8)).toBe(true);

    const repo = createMemoryRepository();
    expect(await seedMon14DayAReference(repo)).toBe(1);
    const history = await repo.listComplete(60);
    expect(history).toHaveLength(1);
    expect(historyHasMon14DayA(history)).toBe(true);

    const sameDay = plannedDayPreview(DAY_TEMPLATES.A, history, MON14_DAY_A_DATE);
    expect(sameDay[0]?.workLabel).toBe('57.5 kg · 3 × 4');
    expect(sameDay[0]?.lastLine).toBe('No prior log');

    const nextWeek = plannedDayPreview(DAY_TEMPLATES.A, history, '2026-09-21');
    expect(nextWeek[0]?.workLabel).toBe('57.5 kg · 3 × 4');
    expect(nextWeek[0]?.lastLine).toBe('Last: 57.5 kg × 4');
    expect(nextWeek[1]?.lastLine).toBe('Last: 50 kg × 8 · Barbell');
    expect(nextWeek[2]?.lastLine).toBe('Last: 37.5 kg × 8 · DBs');
    expect(nextWeek[3]?.lastLine).toBe('Last: 5 kg × 60s');
  });
});

describe('session backup JSON', () => {
  it('round-trips export JSON through parse + merge into listComplete', async () => {
    const source = createMemoryRepository(week1LastReferenceSessions());
    const exported = buildSessionBackup(await source.listComplete(60), '2026-09-14T12:00:00.000Z');
    expect(exported.schema).toBe(BACKUP_SCHEMA);
    expect(exported.schema_version).toBe(BACKUP_SCHEMA_VERSION);
    expect(exported.sessions).toHaveLength(4);

    const dest = createMemoryRepository();
    const result = await importSessionBackupText(dest, JSON.stringify(exported), 'merge');
    expect(result.sessions).toBe(4);
    const history = await dest.listComplete(60);
    expect(history).toHaveLength(4);
    expect(plannedDayPreview(DAY_TEMPLATES.A, history, '2026-09-14')[0]?.lastLine).toBe(
      'Last: 47.5 kg × 5',
    );
  });

  it('merge upserts by session_id and leaves other rows', async () => {
    const extra = createDraftSession('A', '2026-08-31');
    extra.status = 'complete';
    extra.lifts[0].sets = extra.lifts[0].sets.map((set) =>
      isWarmupSet(set) ? set : { ...set, completed: true, weight_kg: 45, reps: 5 },
    );
    const repo = createMemoryRepository([extra]);
    await importSessionBackup(repo, buildSessionBackup(week1LastReferenceSessions()), 'merge');
    const listed = await repo.listComplete(60);
    expect(listed).toHaveLength(5);
    expect(listed.some((row) => row.session_id === extra.session_id)).toBe(true);
  });

  it('replace clears existing complete rows then writes the file', async () => {
    const extra = createDraftSession('B', '2026-08-25');
    extra.status = 'complete';
    const repo = createMemoryRepository([extra, ...week1LastReferenceSessions().slice(0, 1)]);
    await importSessionBackup(repo, buildSessionBackup(week1LastReferenceSessions()), 'replace');
    const listed = await repo.listComplete(60);
    expect(listed).toHaveLength(4);
    expect(listed.some((row) => row.session_id === extra.session_id)).toBe(false);
  });

  it('rejects files that are not linda-lift-sessions JSON', () => {
    expect(() => parseSessionBackupJson('{')).toThrow(/not valid JSON/i);
    expect(() => parseSessionBackupJson(JSON.stringify({ schema: 'ravinto-backup' }))).toThrow(
      /linda-lift-sessions/,
    );
    expect(() =>
      parseSessionBackupJson(JSON.stringify({ schema: BACKUP_SCHEMA, schema_version: 99 })),
    ).toThrow(/schema_version/);
    expect(() =>
      parseSessionBackupJson(
        JSON.stringify({ schema: BACKUP_SCHEMA, schema_version: 1, sessions: 'nope' }),
      ),
    ).toThrow(/array/i);
  });

  it('names the download with the calendar date', () => {
    expect(sessionBackupFilename('2026-09-14')).toBe('linda-lift-sessions-2026-09-14.json');
  });
});
