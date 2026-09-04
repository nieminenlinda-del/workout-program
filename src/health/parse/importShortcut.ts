import { IMPORT_META_KEY } from '../constants';
import type { HealthRepository } from '../repository';
import type { ImportMeta, ShortcutImportResult } from '../types';
import { parseShortcutJsonText } from './shortcutJson';

export interface ImportShortcutOptions {
  fileName?: string;
  now?: Date;
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read Shortcuts JSON'));
    reader.readAsText(blob);
  });
}

export async function importShortcutJson(
  file: Blob,
  repo: HealthRepository,
  options: ImportShortcutOptions = {},
): Promise<ShortcutImportResult> {
  const text = await readBlobText(file);
  const parsed = parseShortcutJsonText(text);
  await repo.putDaily(parsed.days);

  const fileName =
    options.fileName ??
    ('name' in file && typeof (file as File).name === 'string' ? (file as File).name : undefined);

  const meta: ImportMeta = {
    id: IMPORT_META_KEY,
    lastImportAt: (options.now ?? new Date()).toISOString(),
    sampleCount: await repo.countSamples(),
    newSamples: parsed.days.length,
    duplicateSamples: 0,
  };
  if (parsed.exportedAt) meta.exportDate = parsed.exportedAt;
  if (fileName) meta.fileName = fileName;
  await repo.setMeta(meta);

  return {
    daysWritten: parsed.days.length,
    dates: parsed.days.map((row) => row.date),
    meta,
  };
}
