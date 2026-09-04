import { IMPORT_META_KEY, SAMPLE_TYPE, SAMPLE_WRITE_BATCH } from '../constants';
import { helsinkiDay } from '../dates';
import { rollupDay } from '../rollup';
import type { HealthRepository } from '../repository';
import type { HealthSample, ImportMeta, ImportProgress } from '../types';
import { createHealthXmlParser } from './saxParser';
import { streamHealthExportXml } from './unzipExport';

export interface RunImportOptions {
  fileName?: string;
  now?: Date;
  onProgress?: (progress: ImportProgress) => void;
}

async function persistTouchedDays(repo: HealthRepository, days: Iterable<string>): Promise<number> {
  const uniqueDays = [...new Set(days)];
  for (const date of uniqueDays) {
    const [summaries, active] = await Promise.all([
      repo.listByDayAndType(date, SAMPLE_TYPE.ActivitySummary),
      repo.listByDayAndType(date, SAMPLE_TYPE.ActiveEnergyBurned),
    ]);
    await repo.putDaily([rollupDay(date, [...summaries, ...active])]);
  }
  return uniqueDays.length;
}

export async function runHealthImport(
  file: Blob,
  repo: HealthRepository,
  options: RunImportOptions = {},
): Promise<ImportMeta> {
  const onProgress = options.onProgress;
  onProgress?.({ phase: 'unzip', parsed: 0, written: 0, newSamples: 0, duplicates: 0 });

  const parserSamples: HealthSample[] = [];
  let exportDate: string | undefined;
  let parsed = 0;
  let written = 0;
  let newSamples = 0;
  let duplicates = 0;
  const touchedDays = new Set<string>();

  const parser = createHealthXmlParser({
    onSample: (sample) => {
      parserSamples.push(sample);
      parsed += 1;
      if (sample.type === SAMPLE_TYPE.ActiveEnergyBurned || sample.type === SAMPLE_TYPE.ActivitySummary) {
        const day = sample.day ?? helsinkiDay(sample.startDate);
        touchedDays.add(day);
      }
    },
    onExportDate: (iso) => {
      exportDate = iso;
    },
  });

  const flush = async () => {
    if (parserSamples.length === 0) return;
    onProgress?.({ phase: 'save', parsed, written, newSamples, duplicates });
    const batch = parserSamples.splice(0, parserSamples.length);
    const result = await repo.putSamples(batch);
    written += result.written;
    newSamples += result.newSamples;
    duplicates += result.duplicates;
    onProgress?.({ phase: 'save', parsed, written, newSamples, duplicates });
  };

  await streamHealthExportXml(file, async (text, final) => {
    if (text) parser.write(text);
    onProgress?.({ phase: 'parse', parsed, written, newSamples, duplicates });
    if (parserSamples.length >= SAMPLE_WRITE_BATCH || final) await flush();
  });

  parser.close();
  await flush();
  await persistTouchedDays(repo, touchedDays);

  const meta: ImportMeta = {
    id: IMPORT_META_KEY,
    lastImportAt: (options.now ?? new Date()).toISOString(),
    sampleCount: await repo.countSamples(),
    newSamples,
    duplicateSamples: duplicates,
  };
  if (exportDate) meta.exportDate = exportDate;
  if (options.fileName) meta.fileName = options.fileName;
  await repo.setMeta(meta);
  return meta;
}
