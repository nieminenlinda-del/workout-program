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

/** Canonical iOS Shortcuts payload (identical JSON in Ravinto). */
export interface ShortcutActivitySummary {
  activeEnergyBurned: number;
  unit: string;
}

export interface ShortcutDay {
  date: string;
  active_kcal?: number;
  sources?: string[];
  activity_summary?: ShortcutActivitySummary;
  workouts?: unknown[];
}

export interface ShortcutPayload {
  schema: 'linda-health-shortcut';
  schema_version: 1;
  exported_at?: string;
  timezone?: string;
  source?: string;
  days: ShortcutDay[];
}

export interface ShortcutImportResult {
  daysWritten: number;
  dates: string[];
  meta: ImportMeta;
}
