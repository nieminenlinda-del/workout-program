import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { HEALTH_DB_NAME, HEALTH_DB_VERSION, IMPORT_META_KEY } from './constants';
import type { DailyActiveEnergy, HealthSample, ImportMeta } from './types';
import type { HealthRepository, PutSamplesResult } from './repository';

interface HealthDB extends DBSchema {
  health_samples: {
    key: string;
    value: HealthSample;
    indexes: {
      'by-type': string;
      'by-start': string;
      'by-day': string;
      'by-day-type': [string, string];
    };
  };
  daily_active_energy: {
    key: string;
    value: DailyActiveEnergy;
  };
  import_meta: {
    key: string;
    value: ImportMeta;
  };
}

let dbPromise: Promise<IDBPDatabase<HealthDB>> | null = null;

function getDb(): Promise<IDBPDatabase<HealthDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HealthDB>(HEALTH_DB_NAME, HEALTH_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('health_samples')) {
          const samples = db.createObjectStore('health_samples', { keyPath: 'id' });
          samples.createIndex('by-type', 'type');
          samples.createIndex('by-start', 'startDate');
          samples.createIndex('by-day', 'day');
          samples.createIndex('by-day-type', ['day', 'type']);
        }
        if (!db.objectStoreNames.contains('daily_active_energy')) {
          db.createObjectStore('daily_active_energy', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('import_meta')) {
          db.createObjectStore('import_meta', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export function createHealthIndexedDbRepository(): HealthRepository {
  return {
    async putSamples(rows): Promise<PutSamplesResult> {
      const db = await getDb();
      const tx = db.transaction('health_samples', 'readwrite');
      let newSamples = 0;
      let duplicates = 0;
      for (const row of rows) {
        const existing = await tx.store.get(row.id);
        if (existing) duplicates += 1;
        else newSamples += 1;
        await tx.store.put(row);
      }
      await tx.done;
      return { written: rows.length, newSamples, duplicates };
    },
    async getSample(id) {
      const db = await getDb();
      return db.get('health_samples', id);
    },
    async listByDayAndType(day, type) {
      const db = await getDb();
      return db.getAllFromIndex('health_samples', 'by-day-type', [day, type]);
    },
    async putDaily(rows) {
      const db = await getDb();
      const tx = db.transaction('daily_active_energy', 'readwrite');
      for (const row of rows) await tx.store.put(row);
      await tx.done;
    },
    async getDaily(date) {
      const db = await getDb();
      return db.get('daily_active_energy', date);
    },
    async listDailyRange(startDate, endDate) {
      const db = await getDb();
      const rows = await db.getAll(
        'daily_active_energy',
        IDBKeyRange.bound(startDate, endDate),
      );
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    },
    async getMeta() {
      const db = await getDb();
      return db.get('import_meta', IMPORT_META_KEY);
    },
    async setMeta(meta) {
      const db = await getDb();
      await db.put('import_meta', { ...meta, id: IMPORT_META_KEY });
    },
    async countSamples() {
      const db = await getDb();
      return db.count('health_samples');
    },
  };
}

/** Test helper — next openDB call creates a fresh connection after indexedDB reset. */
export function resetHealthDbConnection(): void {
  dbPromise = null;
}
