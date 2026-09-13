import { beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepository, resetDbConnection } from './indexedDbRepository';
import { createMemoryRepository } from './memoryRepository';
import { asSessionLog, isCompleteSession } from './repository';
import { createDraftSession } from '../domain/sessionFactory';
import { isWarmupSet } from '../domain/sets';

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

describe('IndexedDB repository', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase('linda-lift');
    resetDbConnection();
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
});
