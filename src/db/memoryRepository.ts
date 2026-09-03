import type { SessionDraft, SessionLog } from '../types/session';
import type { SessionRepository } from './repository';

export function createMemoryRepository(seed: SessionDraft[] = []): SessionRepository {
  const sessions = new Map<string, SessionDraft>();
  let draft: SessionDraft | undefined;
  for (const row of seed) sessions.set(row.session_id, row);

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
      return [...sessions.values()]
        .sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at))
        .slice(0, limit);
    },
    async listComplete(limit = 20) {
      const all = await this.listRecent(100);
      return all.filter((s) => s.status === 'complete').slice(0, limit);
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
