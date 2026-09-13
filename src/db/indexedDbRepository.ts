import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SessionDraft } from '../types/session';
import { isCompleteSession, sortSessionsNewestFirst, type SessionRepository } from './repository';

const DB_NAME = 'linda-lift';
const DB_VERSION = 1;
const DRAFT_KEY = 'current';

interface LiftDB extends DBSchema {
  sessions: {
    key: string;
    value: SessionDraft;
    indexes: { 'by-date': string };
  };
  drafts: {
    key: string;
    value: SessionDraft;
  };
}

let dbPromise: Promise<IDBPDatabase<LiftDB>> | null = null;

function getDb(): Promise<IDBPDatabase<LiftDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LiftDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'session_id' });
          sessions.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts');
        }
      },
    });
  }
  return dbPromise;
}

export function createIndexedDbRepository(): SessionRepository {
  return {
    async save(session) {
      const db = await getDb();
      const row: SessionDraft = {
        ...session,
        status: 'status' in session ? session.status : 'complete',
        updated_at:
          'updated_at' in session && session.updated_at
            ? session.updated_at
            : new Date().toISOString(),
      };
      await db.put('sessions', row);
    },
    async get(sessionId) {
      const db = await getDb();
      return db.get('sessions', sessionId);
    },
    async listRecent(limit = 20) {
      const db = await getDb();
      return sortSessionsNewestFirst(await db.getAll('sessions')).slice(0, limit);
    },
    async listComplete(limit = 20) {
      const db = await getDb();
      return sortSessionsNewestFirst((await db.getAll('sessions')).filter(isCompleteSession)).slice(
        0,
        limit,
      );
    },
    async getDraft() {
      const db = await getDb();
      return db.get('drafts', DRAFT_KEY);
    },
    async saveDraft(session) {
      const db = await getDb();
      const row: SessionDraft = {
        ...session,
        status: 'draft',
        updated_at: new Date().toISOString(),
      };
      await db.put('drafts', row, DRAFT_KEY);
    },
    async clearDraft() {
      const db = await getDb();
      await db.delete('drafts', DRAFT_KEY);
    },
    async delete(sessionId) {
      const db = await getDb();
      await db.delete('sessions', sessionId);
    },
  };
}

/** Test helper — next openDB call creates a fresh connection after indexedDB reset. */
export function resetDbConnection(): void {
  dbPromise = null;
}
