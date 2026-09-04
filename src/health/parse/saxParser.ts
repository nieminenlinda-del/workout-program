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

function attrsOf(attributes: Record<string, string> | Record<string, { value: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    out[key] = typeof value === 'string' ? value : value.value;
  }
  return out;
}

function emitQuantity(attrs: Record<string, string>, onSample: (sample: HealthSample) => void): void {
  const type = attrs.type;
  if (!type || !INGEST_RECORD_TYPES.has(type)) return;
  const start = tryParseHealthDate(attrs.startDate ?? '');
  const end = tryParseHealthDate(attrs.endDate ?? attrs.startDate ?? '');
  if (!start || !end) return;
  const value = Number(attrs.value);
  if (!Number.isFinite(value)) return;
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

function emitWorkout(attrs: Record<string, string>, onSample: (sample: HealthSample) => void): void {
  const start = tryParseHealthDate(attrs.startDate ?? '');
  const end = tryParseHealthDate(attrs.endDate ?? attrs.startDate ?? '');
  if (!start || !end) return;
  const raw = attrs.totalEnergyBurned;
  const value = raw === undefined || raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(value)) return;
  const sample = buildSample({
    type: SAMPLE_TYPE.Workout,
    sourceName: attrs.sourceName ?? '',
    unit: attrs.totalEnergyBurnedUnit ?? 'kcal',
    value,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  });
  onSample(sample);
}

function emitActivitySummary(attrs: Record<string, string>, onSample: (sample: HealthSample) => void): void {
  const day = parseDateComponents(attrs.dateComponents ?? '');
  if (!day) return;
  const value = Number(attrs.activeEnergyBurned);
  if (!Number.isFinite(value)) return;
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

export function createHealthXmlParser(handlers: HealthParseHandlers) {
  const stripper = new DoctypeStripper();
  const parser = new SaxesParser({ xmlns: false, fragment: false });
  let parseError: Error | undefined;

  parser.on('error', (err) => {
    parseError = err;
  });

  parser.on('opentag', (tag) => {
    const attrs = attrsOf(tag.attributes as Record<string, string> | Record<string, { value: string }>);
    if (tag.name === 'Record') emitQuantity(attrs, handlers.onSample);
    else if (tag.name === 'Workout') emitWorkout(attrs, handlers.onSample);
    else if (tag.name === 'ActivitySummary') emitActivitySummary(attrs, handlers.onSample);
    else if (tag.name === 'ExportDate' && attrs.value) {
      const parsed = tryParseHealthDate(attrs.value);
      if (parsed) handlers.onExportDate?.(parsed.toISOString());
    }
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
