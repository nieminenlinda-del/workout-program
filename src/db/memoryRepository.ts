import type { SessionDraft, SessionLog } from '../types/session';
import { isCompleteSession, sortSessionsNewestFirst, type SessionRepository } from './repository';

export function createMemoryRepository(seed: Array<SessionDraft | SessionLog> = []): SessionRepository {
  const sessions = new Map<string, SessionDraft>();
  let draft: SessionDraft | undefined;
  for (const row of seed) sessions.set(row.session_id, row as SessionDraft);

  const stamp = (session: SessionDraft | SessionLog, status: SessionDraft['status']): SessionDraft => ({
    ...session,
    status: 'status' in session ? session.status : status,
    updated_at:
      'updated_at' in session && session.updated_at
        ? session.updated_at
        : new Date().toISOString(),
  });

  return {
    async save(session) {
      const row = stamp(session, 'complete');
      sessions.set(row.session_id, row);
    },
    async get(sessionId) {
      return sessions.get(sessionId);
    },
    async listRecent(limit = 20) {
      return sortSessionsNewestFirst([...sessions.values()]).slice(0, limit);
    },
    async listComplete(limit = 20) {
      return sortSessionsNewestFirst([...sessions.values()].filter(isCompleteSession)).slice(
        0,
        limit,
      );
    },
    async getDraft() {
      return draft;
    },
    async saveDraft(session) {
      draft = stamp(session, 'draft');
    },
    async clearDraft() {
      draft = undefined;
    },
    async delete(sessionId) {
      sessions.delete(sessionId);
    },
  };
}
