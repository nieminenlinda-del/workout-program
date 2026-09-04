import { zipSync, strToU8 } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_TYPE } from './constants';
import { addCalendarDays, helsinkiDay, startOfHelsinkiDay } from './dates';
import { dedupeSamples } from './dedupe';
import { createHealthIndexedDbRepository, resetHealthDbConnection } from './indexedDbRepository';
import { createMemoryHealthRepository } from './memoryRepository';
import { runHealthImport } from './parse/ingest';
import { parseHealthXmlChunks, parseHealthXmlString } from './parse/saxParser';
import { stripMalformedDoctype } from './parse/stripDoctype';
import { rollupDay, rollupDays } from './rollup';
import { joinTrainingDay, lastNTrainingDays, templateDayForDate } from './trainingDayJoin';
import fixtureXml from './fixtures/export.xml?raw';

function countsByType(samples: { type: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sample of samples) counts[sample.type] = (counts[sample.type] ?? 0) + 1;
  return counts;
}

describe('Apple Health XML parser', () => {
  it('strips the HealthKit DOCTYPE comment subset', () => {
    const stripped = stripMalformedDoctype(fixtureXml);
    expect(stripped).not.toMatch(/<!DOCTYPE/i);
    expect(stripped).toContain('<HealthData');
    expect(stripped).not.toContain('HealthKit Export Version');
  });

  it('ingests priority records from a synthetic export.xml and skips steps', () => {
    const { samples, exportDate } = parseHealthXmlString(fixtureXml);
    expect(exportDate).toBe(new Date('2026-09-11T21:00:00+03:00').toISOString());
    expect(samples.some((s) => s.type.includes('StepCount'))).toBe(false);
    expect(countsByType(samples)).toMatchObject({
      [SAMPLE_TYPE.ActiveEnergyBurned]: 4,
      [SAMPLE_TYPE.BasalEnergyBurned]: 1,
      [SAMPLE_TYPE.HeartRate]: 1,
      [SAMPLE_TYPE.Workout]: 2,
      [SAMPLE_TYPE.ActivitySummary]: 2,
    });
    expect(samples.filter((s) => s.type === SAMPLE_TYPE.ActiveEnergyBurned).map((s) => s.value)).toEqual([
      12.5, 12.5, 30, 55,
    ]);
  });

  it('parses the same fixture when fed in tiny SAX chunks', () => {
    const chunks: string[] = [];
    for (let i = 0; i < fixtureXml.length; i += 37) chunks.push(fixtureXml.slice(i, i + 37));
    const streamed = parseHealthXmlChunks(chunks);
    const whole = parseHealthXmlString(fixtureXml);
    expect(streamed.samples).toHaveLength(whole.samples.length);
    expect(streamed.exportDate).toBe(whole.exportDate);
    expect(streamed.samples.map((s) => s.id)).toEqual(whole.samples.map((s) => s.id));
  });
});

describe('dedupe', () => {
  it('collapses identical (type, sourceName, startDate, endDate, value)', () => {
    const { samples } = parseHealthXmlString(fixtureXml);
    const unique = dedupeSamples(samples);
    expect(samples.filter((s) => s.type === SAMPLE_TYPE.ActiveEnergyBurned)).toHaveLength(4);
    expect(unique.filter((s) => s.type === SAMPLE_TYPE.ActiveEnergyBurned)).toHaveLength(3);
    expect(unique).toHaveLength(samples.length - 1);
  });
});

describe('daily active energy rollup', () => {
  it('prefers ActivitySummary over sample sums and ignores workouts / basal / HR', () => {
    const { samples } = parseHealthXmlString(fixtureXml);
    const unique = dedupeSamples(samples);
    const days = Object.fromEntries(rollupDays(unique).map((row) => [row.date, row]));

    expect(days['2026-09-07']?.active_kcal).toBe(450);
    expect(days['2026-09-07']?.sources).toEqual(expect.arrayContaining(['ActivitySummary', 'Apple Watch']));
    expect(days['2026-09-08']?.active_kcal).toBe(210);
    expect(days['2026-09-09']?.active_kcal).toBe(55);
    expect(days['2026-09-10']).toBeUndefined();

    const mondaySamples = unique.filter((s) => s.day === '2026-09-07');
    expect(mondaySamples.some((s) => s.type === SAMPLE_TYPE.Workout)).toBe(true);
    expect(rollupDay('2026-09-07', mondaySamples).active_kcal).toBe(450);
  });

  it('converts kJ ActiveEnergyBurned when no ActivitySummary exists', () => {
    const xml = `<?xml version="1.0"?><HealthData>
      <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Watch" unit="kJ" value="418.4" startDate="2026-09-09 12:00:00 +0300" endDate="2026-09-09 12:10:00 +0300"/>
    </HealthData>`;
    const { samples } = parseHealthXmlString(xml);
    expect(rollupDays(samples)[0]).toMatchObject({ date: '2026-09-09', active_kcal: 100 });
  });
});

describe('Europe/Helsinki day bucketing', () => {
  it('buckets a late-evening UTC instant onto the next Helsinki calendar day', () => {
    expect(helsinkiDay('2026-08-31T21:30:00.000Z')).toBe('2026-09-01');
    expect(helsinkiDay(new Date('2026-09-01T00:30:00+03:00'))).toBe('2026-09-01');
    expect(helsinkiDay(startOfHelsinkiDay('2026-09-01'))).toBe('2026-09-01');
  });
});

describe('training-day join', () => {
  it('maps Mon/Tue/Thu/Fri to A/B/C/D and other weekdays to rest', () => {
    expect(templateDayForDate('2026-09-07')).toBe('A');
    expect(templateDayForDate('2026-09-08')).toBe('B');
    expect(templateDayForDate('2026-09-09')).toBe('rest');
    expect(templateDayForDate('2026-09-10')).toBe('C');
    expect(templateDayForDate('2026-09-11')).toBe('D');
    expect(templateDayForDate('2026-09-12')).toBe('rest');
    expect(templateDayForDate('2026-09-13')).toBe('rest');
  });

  it('joins last N days of active energy with training vs rest labels', () => {
    const { samples } = parseHealthXmlString(fixtureXml);
    const daily = rollupDays(dedupeSamples(samples));
    const rows = lastNTrainingDays(daily, 5, '2026-09-11');
    expect(rows.map((row) => ({ date: row.date, day: row.template_day, kcal: row.active_kcal }))).toEqual([
      { date: '2026-09-11', day: 'D', kcal: 0 },
      { date: '2026-09-10', day: 'C', kcal: 0 },
      { date: '2026-09-09', day: 'rest', kcal: 55 },
      { date: '2026-09-08', day: 'B', kcal: 210 },
      { date: '2026-09-07', day: 'A', kcal: 450 },
    ]);
    expect(joinTrainingDay('2026-09-07', daily.find((d) => d.date === '2026-09-07'))).toEqual({
      date: '2026-09-07',
      template_day: 'A',
      active_kcal: 450,
    });
  });
});

describe('health import pipeline', () => {
  it('unzips apple_health_export/export.xml, writes samples, and rolls up days', async () => {
    const zipped = zipSync({
      'apple_health_export/export_cda.xml': strToU8('<ClinicalDocument/>'),
      'apple_health_export/export.xml': strToU8(fixtureXml),
    });
    const file = new File([zipped], 'export.zip', { type: 'application/zip' });
    const repo = createMemoryHealthRepository();
    const meta = await runHealthImport(file, repo, {
      fileName: 'export.zip',
      now: new Date('2026-09-11T18:00:00.000Z'),
    });

    expect(meta.exportDate).toBe(new Date('2026-09-11T21:00:00+03:00').toISOString());
    expect(meta.sampleCount).toBe(9);
    expect(meta.newSamples).toBe(9);
    expect(meta.duplicateSamples).toBe(1);
    expect(await repo.getDaily('2026-09-07')).toMatchObject({ active_kcal: 450 });
    expect(await repo.getDaily('2026-09-09')).toMatchObject({ active_kcal: 55 });

    const again = await runHealthImport(file, repo, { fileName: 'export.zip' });
    expect(again.sampleCount).toBe(9);
    expect(again.newSamples).toBe(0);
    expect(again.duplicateSamples).toBe(10);
  });
});

describe('linda-health IndexedDB', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase('linda-health');
    resetHealthDbConnection();
  });

  it('persists samples, daily rollup, and import metadata', async () => {
    const repo = createHealthIndexedDbRepository();
    const xmlFile = new File([fixtureXml], 'export.xml', { type: 'text/xml' });
    const meta = await runHealthImport(xmlFile, repo, { fileName: 'export.xml' });
    expect(meta.sampleCount).toBe(9);
    expect(await repo.getDaily('2026-09-08')).toMatchObject({ date: '2026-09-08', active_kcal: 210 });
    const range = await repo.listDailyRange('2026-09-07', '2026-09-11');
    expect(range.map((row) => row.date)).toEqual(['2026-09-09', '2026-09-08', '2026-09-07']);
    expect((await repo.getMeta())?.fileName).toBe('export.xml');
  });
});

describe('calendar helper', () => {
  it('walks civil dates without shifting across months', () => {
    expect(addCalendarDays('2026-09-01', -1)).toBe('2026-08-31');
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01');
  });
});
