/** Monday of the weigh-in week, Europe calendar date `YYYY-MM-DD`. */
export interface BodyweightEntry {
  week: string;
  kg: number;
}

/** Garmin weekly weigh-ins. Seeded once into an empty store. */
export const BODYWEIGHT_SEED: readonly BodyweightEntry[] = [
  { week: '2026-09-21', kg: 61.2 },
  { week: '2026-09-28', kg: 61.6 },
  { week: '2026-10-05', kg: 62.0 },
  { week: '2026-10-12', kg: 60.8 },
  { week: '2026-10-19', kg: 61.0 },
];

export function isBodyweightEntry(value: unknown): value is BodyweightEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.week === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.week) &&
    typeof row.kg === 'number' &&
    Number.isFinite(row.kg) &&
    row.kg > 0 &&
    row.kg < 500
  );
}
