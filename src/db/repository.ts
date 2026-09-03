import type { SessionDraft, SessionLog } from '../types/session';

export interface SessionRepository {
  save(session: SessionDraft | SessionLog): Promise<void>;
  get(sessionId: string): Promise<SessionDraft | undefined>;
  listRecent(limit?: number): Promise<SessionDraft[]>;
  listComplete(limit?: number): Promise<SessionDraft[]>;
  getDraft(): Promise<SessionDraft | undefined>;
  saveDraft(session: SessionDraft): Promise<void>;
  clearDraft(): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export function asSessionLog(row: SessionDraft | SessionLog): SessionLog {
  return {
    session_id: row.session_id,
    date: row.date,
    template_day: row.template_day,
    readiness: row.readiness,
    lifts: row.lifts,
    pain_flag: row.pain_flag,
    notes: row.notes,
  };
}
