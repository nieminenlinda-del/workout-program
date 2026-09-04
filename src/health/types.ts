import type { CanonicalTemplateDay } from '../types/session';

export type HealthSampleType =
  | 'HKQuantityTypeIdentifierActiveEnergyBurned'
  | 'HKQuantityTypeIdentifierBasalEnergyBurned'
  | 'HKQuantityTypeIdentifierHeartRate'
  | 'HKWorkout'
  | 'HKActivitySummary'
  | string;

/**
 * Normalized Health row. `day` is derived (Europe/Helsinki of startDate) for
 * IndexedDB indexes — calorie-tracker can ignore it.
 */
export interface HealthSample {
  id: string;
  type: HealthSampleType;
  sourceName: string;
  unit: string;
  value: number;
  startDate: string;
  endDate: string;
  workoutId?: string;
  day?: string;
}

export interface DailyActiveEnergy {
  date: string;
  active_kcal: number;
  sources: string[];
}

export interface ImportMeta {
  id: 'current';
  lastImportAt: string;
  exportDate?: string;
  sampleCount: number;
  fileName?: string;
  newSamples?: number;
  duplicateSamples?: number;
}

export type TrainingTemplateDay = CanonicalTemplateDay | 'rest';

export interface TrainingDayEnergy {
  date: string;
  template_day: TrainingTemplateDay;
  active_kcal: number;
}

export interface ImportProgress {
  phase: 'unzip' | 'parse' | 'save';
  parsed: number;
  written: number;
  newSamples: number;
  duplicates: number;
}
