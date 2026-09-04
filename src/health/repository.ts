import type { DailyActiveEnergy, HealthSample, ImportMeta } from './types';

export interface PutSamplesResult {
  written: number;
  newSamples: number;
  duplicates: number;
}

export interface HealthRepository {
  putSamples(samples: HealthSample[]): Promise<PutSamplesResult>;
  getSample(id: string): Promise<HealthSample | undefined>;
  listByDayAndType(day: string, type: string): Promise<HealthSample[]>;
  putDaily(rows: DailyActiveEnergy[]): Promise<void>;
  getDaily(date: string): Promise<DailyActiveEnergy | undefined>;
  listDailyRange(startDate: string, endDate: string): Promise<DailyActiveEnergy[]>;
  getMeta(): Promise<ImportMeta | undefined>;
  setMeta(meta: ImportMeta): Promise<void>;
  countSamples(): Promise<number>;
}
