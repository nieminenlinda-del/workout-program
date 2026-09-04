import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SessionDraft } from '../types/session';
import type { SessionRepository } from '../db/repository';
import { createIndexedDbRepository } from '../db/indexedDbRepository';
import { createDraftSession } from '../domain/sessionFactory';
import type { TemplateDay } from '../types/session';
import { todayIsoDate } from '../domain/templateDay';

export type AppView =
  | 'home'
  | 'readiness'
  | 'workout'
  | 'save'
  | 'history'
  | 'detail'
  | 'interval'
  | 'health';

export function useRepository(): SessionRepository {
  return useMemo(() => createIndexedDbRepository(), []);
}

export function useSessionFlow(repo: SessionRepository) {
  const [view, setView] = useState<AppView>('home');
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [history, setHistory] = useState<SessionDraft[]>([]);
  const [detail, setDetail] = useState<SessionDraft | null>(null);
  const [booted, setBooted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    const rows = await repo.listComplete(30);
    setHistory(rows);
  }, [repo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await repo.getDraft();
      if (!cancelled && existing) setDraft(existing);
      await refreshHistory();
      if (!cancelled) setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, refreshHistory]);

  const persistDraft = useCallback(
    async (next: SessionDraft) => {
      setDraft(next);
      try {
        await repo.saveDraft(next);
      } catch (err) {
        console.warn('draft persist failed', err);
      }
    },
    [repo],
  );

  const patchDraft = useCallback(
    (updater: (current: SessionDraft) => SessionDraft) => {
      setDraft((current) => {
        if (!current) return current;
        const next = updater(current);
        void repo.saveDraft(next);
        return next;
      });
    },
    [repo],
  );

  const startSession = useCallback(
    async (templateDay: TemplateDay) => {
      const next = createDraftSession(templateDay, todayIsoDate());
      await persistDraft(next);
      setView('readiness');
    },
    [persistDraft],
  );

  const resumeSession = useCallback(() => {
    if (draft) setView('readiness');
  }, [draft]);

  const abandonDraft = useCallback(async () => {
    await repo.clearDraft();
    setDraft(null);
    setView('home');
  }, [repo]);

  const completeSession = useCallback(async () => {
    if (!draft) return;
    setSaveError(null);
    const complete: SessionDraft = {
      ...draft,
      status: 'complete',
      updated_at: new Date().toISOString(),
    };
    try {
      await repo.save(complete);
      await repo.clearDraft();
      setDraft(null);
      await refreshHistory();
      setView('home');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save session');
    }
  }, [draft, repo, refreshHistory]);

  const openDetail = useCallback((session: SessionDraft) => {
    setDetail(session);
    setView('detail');
  }, []);

  return {
    view,
    setView,
    draft,
    patchDraft,
    persistDraft,
    history,
    detail,
    booted,
    saveError,
    startSession,
    resumeSession,
    abandonDraft,
    completeSession,
    openDetail,
    refreshHistory,
  };
}
