import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { BODYWEIGHT_SEED } from '../domain/bodyweight';
import { createDraftSession } from '../domain/sessionFactory';
import { isWarmupSet } from '../domain/sets';
import { createIndexedDbRepository, resetDbConnection } from './indexedDbRepository';
import { createMemoryRepository } from './memoryRepository';
import { asSessionLog, isCompleteSession } from './repository';

describe('memory repository', () => {
  it('round-trips a completed SessionLog', async () => {
    const repo = createMemoryRepository();
    const draft = createDraftSession('A', '2026-09-03');
    draft.status = 'complete';
    draft.notes = 'bar speed good';
    await repo.save(draft);
    const loaded = await repo.get(draft.session_id);
    expect(loaded?.notes).toBe('bar speed good');
    expect(asSessionLog(loaded!).lifts[0]?.sets[0]).toEqual(
      expect.objectContaining({
        weight_kg: expect.any(Number),
        reps: expect.any(Number),
        rpe: expect.any(Number),
        completed: false,
      }),
    );
  });
});

function deleteLiftDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('linda-lift');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('deleteDatabase failed'));
  });
}

describe('IndexedDB repository', () => {
  beforeEach(async () => {
    await resetDbConnection();
    await deleteLiftDb();
  });

  it('persists draft and completed sessions separately', async () => {
    const repo = createIndexedDbRepository();
    const draft = createDraftSession('D', '2026-09-04');
    await repo.saveDraft(draft);
    const restored = await repo.getDraft();
    expect(restored?.template_day).toBe('D');

    draft.status = 'complete';
    draft.lifts[0].sets[0].completed = true;
    await repo.save(draft);
    await repo.clearDraft();
    expect(await repo.getDraft()).toBeUndefined();
    const list = await repo.listComplete();
    expect(list).toHaveLength(1);
    expect(list[0]?.session_id).toBe(draft.session_id);
    expect(list[0]?.lifts[0]?.sets[0]?.completed).toBe(true);
  });
});

describe('complete-session listing', () => {
  it('treats missing status as complete and ignores explicit drafts', async () => {
    const week1 = createDraftSession('A', '2026-09-07');
    week1.lifts[0].sets = week1.lifts[0].sets.map((set) =>
      isWarmupSet(set) ? set : { ...set, completed: true },
    );
    const { status: _status, ...legacy } = week1;
    expect(isCompleteSession(legacy)).toBe(true);
    expect(isCompleteSession({ status: 'complete' })).toBe(true);
    expect(isCompleteSession({ status: 'draft' })).toBe(false);

    const draftRow = createDraftSession('B', '2026-09-08');
    const repo = createMemoryRepository([legacy as typeof week1, draftRow]);
    const listed = await repo.listComplete();
    expect(listed.map((row) => row.date)).toEqual(['2026-09-07']);
  });

  it('returns every finished session while the capped list stays at 20', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => {
      const draft = createDraftSession('A', `2026-08-${String(index + 1).padStart(2, '0')}`);
      draft.status = 'complete';
      draft.session_id = `bulk-${index}`;
      return draft;
    });
    const repo = createMemoryRepository(rows);
    expect(await repo.listComplete()).toHaveLength(20);
    expect(await repo.listAllComplete()).toHaveLength(25);
    expect(await repo.listBodyweight()).toEqual([...BODYWEIGHT_SEED]);
  });
});

describe('bodyweight seed', () => {
  beforeEach(async () => {
    await resetDbConnection();
    await deleteLiftDb();
  });

  it('seeds on a v1 upgrade and does not restore a deleted week', async () => {
    const v1 = await openDB('linda-lift', 1, {
      upgrade(db) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'session_id' });
        sessions.createIndex('by-date', 'date');
        db.createObjectStore('drafts');
      },
    });
    v1.close();

    const repo = createIndexedDbRepository();
    const seeded = await repo.listBodyweight();
    expect(seeded).toEqual([...BODYWEIGHT_SEED]);

    await repo.replaceBodyweight(seeded.filter((row) => row.week !== '2026-10-19'));
    await resetDbConnection();
    const reopened = createIndexedDbRepository();
    const after = await reopened.listBodyweight();
    expect(after.map((row) => row.week)).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);

    const extra = Array.from({ length: 22 }, (_, index) => {
      const draft = createDraftSession('B', `2026-07-${String((index % 28) + 1).padStart(2, '0')}`);
      draft.status = 'complete';
      draft.session_id = `idb-bulk-${index}`;
      return draft;
    });
    for (const row of extra) await reopened.save(row);
    expect(await reopened.listComplete()).toHaveLength(20);
    expect(await reopened.listAllComplete()).toHaveLength(22);
  });
});
