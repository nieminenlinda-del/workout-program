import { helsinkiDay } from './dates';
import type { HealthSample } from './types';

export function makeSampleId(parts: {
  type: string;
  sourceName: string;
  startDate: string;
  endDate: string;
  value: number | string;
}): string {
  return [parts.type, parts.sourceName, parts.startDate, parts.endDate, String(parts.value)].join(
    '\u001f',
  );
}

export function buildSample(input: {
  type: string;
  sourceName: string;
  unit: string;
  value: number;
  startDate: string;
  endDate: string;
  workoutId?: string;
}): HealthSample {
  const id = makeSampleId(input);
  const sample: HealthSample = {
    id,
    type: input.type,
    sourceName: input.sourceName,
    unit: input.unit,
    value: input.value,
    startDate: input.startDate,
    endDate: input.endDate,
    day: helsinkiDay(input.startDate),
  };
  if (input.workoutId) sample.workoutId = input.workoutId;
  else if (input.type === 'HKWorkout') sample.workoutId = id;
  return sample;
}

export function dedupeSamples(samples: HealthSample[]): HealthSample[] {
  const seen = new Set<string>();
  const out: HealthSample[] = [];
  for (const sample of samples) {
    if (seen.has(sample.id)) continue;
    seen.add(sample.id);
    out.push(sample);
  }
  return out;
}
