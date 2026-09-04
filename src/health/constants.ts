/** Shared IndexedDB for Linda Lift and Ravinto (calorie-tracker) on the same origin. */
export const HEALTH_DB_NAME = 'linda-health';
export const HEALTH_DB_VERSION = 1;
export const HEALTH_TZ = 'Europe/Helsinki';

export const IMPORT_META_KEY = 'current';

export const SAMPLE_TYPE = {
  ActiveEnergyBurned: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  BasalEnergyBurned: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  HeartRate: 'HKQuantityTypeIdentifierHeartRate',
  Workout: 'HKWorkout',
  ActivitySummary: 'HKActivitySummary',
} as const;

export const INGEST_RECORD_TYPES = new Set<string>([
  SAMPLE_TYPE.ActiveEnergyBurned,
  SAMPLE_TYPE.BasalEnergyBurned,
  SAMPLE_TYPE.HeartRate,
]);

export const HEALTH_LOOKBACK_DAYS = 14;
export const SAMPLE_WRITE_BATCH = 250;

/** Canonical iOS Shortcuts JSON handoff — identical in Ravinto (calorie-tracker). */
export const SHORTCUT_SCHEMA = 'linda-health-shortcut';
export const SHORTCUT_SCHEMA_VERSION = 1;
export const SHORTCUT_FILE_NAME = 'linda-health-shortcut.json';
