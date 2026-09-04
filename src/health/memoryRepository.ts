import { IMPORT_META_KEY } from './constants';
import type { DailyActiveEnergy, HealthSample, ImportMeta } from './types';
import type { HealthRepository, PutSamplesResult } from './repository';

export function createMemoryHealthRepository(seed: HealthSample[] = []): HealthRepository {
  const samples = new Map<string, HealthSample>();
  const daily = new Map<string, DailyActiveEnergy>();
  let meta: ImportMeta | undefined;
  for (const row of seed) samples.set(row.id, row);

  return {
    async putSamples(rows): Promise<PutSamplesResult> {
      let newSamples = 0;
      let duplicates = 0;
      for (const row of rows) {
        if (samples.has(row.id)) duplicates += 1;
        else newSamples += 1;
        samples.set(row.id, row);
      }
      return { written: rows.length, newSamples, duplicates };
    },
    async getSample(id) {
      return samples.get(id);
    },
    async listByDayAndType(day, type) {
      return [...samples.values()].filter((row) => row.day === day && row.type === type);
    },
    async putDaily(rows) {
      for (const row of rows) daily.set(row.date, row);
    },
    async getDaily(date) {
      return daily.get(date);
    },
    async listDailyRange(startDate, endDate) {
      return [...daily.values()]
        .filter((row) => row.date >= startDate && row.date <= endDate)
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    async getMeta() {
      return meta;
    },
    async setMeta(next) {
      meta = { ...next, id: IMPORT_META_KEY };
    },
    async countSamples() {
      return samples.size;
    },
  };
}
