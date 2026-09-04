import { SaxesParser } from 'saxes';
import { INGEST_RECORD_TYPES, SAMPLE_TYPE } from '../constants';
import { endOfHelsinkiDayIso, parseDateComponents, startOfHelsinkiDayIso, tryParseHealthDate } from '../dates';
import { buildSample } from '../dedupe';
import type { HealthSample } from '../types';
import { DoctypeStripper } from './stripDoctype';

export interface HealthParseHandlers {
  onSample: (sample: HealthSample) => void;
  onExportDate?: (iso: string) => void;
}

interface OpenWorkout {
  attrs: Record<string, string>;
  energy?: number;
  energyUnit: string;
}

function attrsOf(attributes: Record<string, string> | Record<string, { value: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    out[key] = typeof value === 'string' ? value : value.value;
  }
  return out;
}

function finiteNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function emitQuantity(attrs: Record<string, string>, onSample: (sample: HealthSample) => void): void {
  const type = attrs.type;
  if (!type || !INGEST_RECORD_TYPES.has(type)) return;
  const start = tryParseHealthDate(attrs.startDate ?? '');
  const end = tryParseHealthDate(attrs.endDate ?? attrs.startDate ?? '');
  if (!start || !end) return;
  const value = finiteNumber(attrs.value);
  if (value === undefined) return;
  onSample(
    buildSample({
      type,
      sourceName: attrs.sourceName ?? '',
      unit: attrs.unit ?? '',
      value,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    }),
  );
}

function emitWorkout(open: OpenWorkout, onSample: (sample: HealthSample) => void): void {
  const start = tryParseHealthDate(open.attrs.startDate ?? '');
  const end = tryParseHealthDate(open.attrs.endDate ?? open.attrs.startDate ?? '');
  if (!start || !end) return;
  const value = open.energy ?? 0;
  if (!Number.isFinite(value)) return;
  onSample(
    buildSample({
      type: SAMPLE_TYPE.Workout,
      sourceName: open.attrs.sourceName ?? '',
      unit: open.energyUnit,
      value,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    }),
  );
}

function emitActivitySummary(attrs: Record<string, string>, onSample: (sample: HealthSample) => void): void {
  const day = parseDateComponents(attrs.dateComponents ?? '');
  if (!day) return;
  const value = finiteNumber(attrs.activeEnergyBurned);
  if (value === undefined) return;
  onSample(
    buildSample({
      type: SAMPLE_TYPE.ActivitySummary,
      sourceName: 'ActivitySummary',
      unit: attrs.activeEnergyBurnedUnit ?? 'kcal',
      value,
      startDate: startOfHelsinkiDayIso(day),
      endDate: endOfHelsinkiDayIso(day),
    }),
  );
}

function beginWorkout(attrs: Record<string, string>): OpenWorkout {
  const energy = finiteNumber(attrs.totalEnergyBurned);
  return {
    attrs,
    energy,
    energyUnit: attrs.totalEnergyBurnedUnit ?? 'kcal',
  };
}

function applyWorkoutStatistics(open: OpenWorkout, attrs: Record<string, string>): void {
  if (attrs.type !== SAMPLE_TYPE.ActiveEnergyBurned) return;
  if (open.energy !== undefined) return;
  const energy = finiteNumber(attrs.sum ?? attrs.value);
  if (energy === undefined) return;
  open.energy = energy;
  if (attrs.unit) open.energyUnit = attrs.unit;
}

export function createHealthXmlParser(handlers: HealthParseHandlers) {
  const stripper = new DoctypeStripper();
  const parser = new SaxesParser({ xmlns: false, fragment: false });
  let parseError: Error | undefined;
  let openWorkout: OpenWorkout | null = null;

  parser.on('error', (err) => {
    parseError = err;
  });

  parser.on('opentag', (tag) => {
    const attrs = attrsOf(tag.attributes as Record<string, string> | Record<string, { value: string }>);
    if (tag.name === 'Record') emitQuantity(attrs, handlers.onSample);
    else if (tag.name === 'Workout') openWorkout = beginWorkout(attrs);
    else if (tag.name === 'WorkoutStatistics' && openWorkout) applyWorkoutStatistics(openWorkout, attrs);
    else if (tag.name === 'ActivitySummary') emitActivitySummary(attrs, handlers.onSample);
    else if (tag.name === 'ExportDate' && attrs.value) {
      const parsed = tryParseHealthDate(attrs.value);
      if (parsed) handlers.onExportDate?.(parsed.toISOString());
    }
  });

  parser.on('closetag', (tag) => {
    if (tag.name !== 'Workout' || !openWorkout) return;
    emitWorkout(openWorkout, handlers.onSample);
    openWorkout = null;
  });

  return {
    write(chunk: string) {
      const ready = stripper.push(chunk);
      if (ready) parser.write(ready);
    },
    close() {
      const rest = stripper.flush();
      if (rest) parser.write(rest);
      parser.close();
      if (openWorkout) {
        emitWorkout(openWorkout, handlers.onSample);
        openWorkout = null;
      }
      if (parseError) throw parseError;
    },
  };
}

export function parseHealthXmlString(xml: string): { samples: HealthSample[]; exportDate?: string } {
  const samples: HealthSample[] = [];
  let exportDate: string | undefined;
  const parser = createHealthXmlParser({
    onSample: (sample) => samples.push(sample),
    onExportDate: (iso) => {
      exportDate = iso;
    },
  });
  parser.write(xml);
  parser.close();
  return { samples, exportDate };
}

export function parseHealthXmlChunks(chunks: string[]): { samples: HealthSample[]; exportDate?: string } {
  const samples: HealthSample[] = [];
  let exportDate: string | undefined;
  const parser = createHealthXmlParser({
    onSample: (sample) => samples.push(sample),
    onExportDate: (iso) => {
      exportDate = iso;
    },
  });
  for (const chunk of chunks) parser.write(chunk);
  parser.close();
  return { samples, exportDate };
}
