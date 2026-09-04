import { SAMPLE_TYPE } from './constants';
import type { DailyActiveEnergy, HealthSample } from './types';

export function toKcal(value: number, unit: string): number {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'kj' || normalized === 'kilojoule' || normalized === 'kilojoules') {
    return value / 4.184;
  }
  return value;
}

export function roundKcal(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Daily active energy: prefer ActivitySummary when present for that Helsinki
 * day, otherwise sum ActiveEnergyBurned samples. Workout totalEnergyBurned is
 * stored but not added (it is already included in Active Energy).
 */
export function rollupDay(date: string, samples: HealthSample[]): DailyActiveEnergy {
  const summaries = samples.filter((sample) => sample.type === SAMPLE_TYPE.ActivitySummary);
  const active = samples.filter((sample) => sample.type === SAMPLE_TYPE.ActiveEnergyBurned);

  if (summaries.length > 0) {
    const best = summaries.reduce((a, b) => (toKcal(b.value, b.unit) > toKcal(a.value, a.unit) ? b : a));
    return {
      date,
      active_kcal: roundKcal(toKcal(best.value, best.unit)),
      sources: unique([...summaries.map((s) => s.sourceName), ...active.map((s) => s.sourceName)]),
    };
  }

  const kcal = active.reduce((sum, sample) => sum + toKcal(sample.value, sample.unit), 0);
  return {
    date,
    active_kcal: roundKcal(kcal),
    sources: unique(active.map((sample) => sample.sourceName)),
  };
}

export function rollupDays(samples: HealthSample[]): DailyActiveEnergy[] {
  const byDay = new Map<string, HealthSample[]>();
  for (const sample of samples) {
    if (sample.type !== SAMPLE_TYPE.ActivitySummary && sample.type !== SAMPLE_TYPE.ActiveEnergyBurned) {
      continue;
    }
    const day = sample.day;
    if (!day) continue;
    const list = byDay.get(day);
    if (list) list.push(sample);
    else byDay.set(day, [sample]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => rollupDay(date, rows));
}
