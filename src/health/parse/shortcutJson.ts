import { SHORTCUT_SCHEMA, SHORTCUT_SCHEMA_VERSION } from '../constants';
import { roundKcal, toKcal } from '../rollup';
import type { DailyActiveEnergy } from '../types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedShortcutFile {
  exportedAt?: string;
  timezone?: string;
  source?: string;
  days: DailyActiveEnergy[];
}

export function looksLikeShortcutJsonFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) return true;
  const type = file.type.toLowerCase();
  return type.includes('json');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function uniqueSources(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function kcalFromSummary(summary: unknown): number | undefined {
  const record = asRecord(summary);
  if (!record) return undefined;
  const burned = finiteNumber(record.activeEnergyBurned);
  if (burned === undefined) return undefined;
  const unit = typeof record.unit === 'string' && record.unit.trim() ? record.unit : 'kcal';
  return roundKcal(toKcal(burned, unit));
}

function sourcesForDay(day: Record<string, unknown>, usedSummary: boolean): string[] {
  const raw = Array.isArray(day.sources)
    ? uniqueSources(day.sources.filter((item): item is string => typeof item === 'string'))
    : [];
  if (usedSummary && !raw.includes('ActivitySummary')) raw.unshift('ActivitySummary');
  if (raw.length > 0) return raw;
  return usedSummary ? ['ActivitySummary'] : ['iOS Shortcuts'];
}

function dayToDaily(item: unknown): DailyActiveEnergy | null {
  const day = asRecord(item);
  if (!day) return null;
  if (typeof day.date !== 'string' || !DATE_RE.test(day.date)) return null;

  const fromSummary = kcalFromSummary(day.activity_summary);
  const usedSummary = fromSummary !== undefined;
  const fromField = finiteNumber(day.active_kcal);
  const kcal = fromSummary ?? (fromField !== undefined ? roundKcal(fromField) : undefined);
  if (kcal === undefined) return null;

  return {
    date: day.date,
    active_kcal: kcal,
    sources: sourcesForDay(day, usedSummary),
  };
}

function exportedAtIso(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function parseShortcutPayload(raw: unknown): ParsedShortcutFile {
  const obj = asRecord(raw);
  if (!obj) {
    throw new Error('Shortcuts file must be a JSON object.');
  }
  if (obj.schema !== SHORTCUT_SCHEMA) {
    throw new Error(`Unknown Health JSON schema (expected ${SHORTCUT_SCHEMA}).`);
  }
  if (obj.schema_version !== SHORTCUT_SCHEMA_VERSION) {
    throw new Error(`Unsupported Shortcuts schema_version (expected ${SHORTCUT_SCHEMA_VERSION}).`);
  }
  if (!Array.isArray(obj.days)) {
    throw new Error('Shortcuts file is missing a days array.');
  }

  const rows: DailyActiveEnergy[] = [];
  for (const item of obj.days) {
    const row = dayToDaily(item);
    if (row) rows.push(row);
  }
  if (rows.length === 0) {
    throw new Error('No usable days in this Shortcuts file.');
  }

  const byDate = new Map<string, DailyActiveEnergy>();
  for (const row of rows) byDate.set(row.date, row);

  const parsed: ParsedShortcutFile = {
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
  const exportedAt = exportedAtIso(obj.exported_at);
  if (exportedAt) parsed.exportedAt = exportedAt;
  if (typeof obj.timezone === 'string' && obj.timezone.trim()) parsed.timezone = obj.timezone;
  if (typeof obj.source === 'string' && obj.source.trim()) parsed.source = obj.source;
  return parsed;
}

export function parseShortcutJsonText(text: string): ParsedShortcutFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      'This file is not valid JSON. Export linda-health-shortcut.json from the Linda Health Sync Shortcut.',
    );
  }
  return parseShortcutPayload(raw);
}
