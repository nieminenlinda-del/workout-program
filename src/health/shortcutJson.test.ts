import { beforeEach, describe, expect, it } from 'vitest';
import { SHORTCUT_FILE_NAME, SHORTCUT_SCHEMA, SHORTCUT_SCHEMA_VERSION } from './constants';
import { createHealthIndexedDbRepository, resetHealthDbConnection } from './indexedDbRepository';
import { createMemoryHealthRepository } from './memoryRepository';
import { importShortcutJson } from './parse/importShortcut';
import { looksLikeShortcutJsonFile, parseShortcutJsonText, parseShortcutPayload } from './parse/shortcutJson';
import fixtureJson from './fixtures/linda-health-shortcut.json?raw';

const canonical = {
  schema: SHORTCUT_SCHEMA,
  schema_version: SHORTCUT_SCHEMA_VERSION,
  exported_at: '2026-09-04T08:00:00+03:00',
  timezone: 'Europe/Helsinki',
  source: 'iOS Shortcuts',
  days: [
    {
      date: '2026-09-03',
      active_kcal: 487,
      sources: ['ActivitySummary', 'Apple Watch'],
      activity_summary: {
        activeEnergyBurned: 487,
        unit: 'kcal',
      },
      workouts: [],
    },
  ],
};

describe('iOS Shortcuts JSON', () => {
  it('parses the canonical linda-health-shortcut fixture', () => {
    expect(JSON.parse(fixtureJson)).toMatchObject(canonical);
    const parsed = parseShortcutJsonText(fixtureJson);
    expect(parsed.source).toBe('iOS Shortcuts');
    expect(parsed.timezone).toBe('Europe/Helsinki');
    expect(parsed.exportedAt).toBe(new Date('2026-09-04T08:00:00+03:00').toISOString());
    expect(parsed.days).toEqual([
      {
        date: '2026-09-03',
        active_kcal: 487,
        sources: ['ActivitySummary', 'Apple Watch'],
      },
    ]);
  });

  it('prefers ActivitySummary kcal when it disagrees with active_kcal', () => {
    const parsed = parseShortcutPayload({
      ...canonical,
      days: [
        {
          date: '2026-09-03',
          active_kcal: 10,
          sources: ['Apple Watch'],
          activity_summary: { activeEnergyBurned: 487, unit: 'kcal' },
          workouts: [{ activeEnergy: 900 }],
        },
      ],
    });
    expect(parsed.days[0]).toMatchObject({
      date: '2026-09-03',
      active_kcal: 487,
      sources: ['ActivitySummary', 'Apple Watch'],
    });
  });

  it('falls back to active_kcal when ActivitySummary is missing', () => {
    const parsed = parseShortcutPayload({
      schema: SHORTCUT_SCHEMA,
      schema_version: 1,
      days: [{ date: '2026-09-02', active_kcal: 55, sources: ['Active Energy'] }],
    });
    expect(parsed.days[0]).toEqual({
      date: '2026-09-02',
      active_kcal: 55,
      sources: ['Active Energy'],
    });
  });

  it('converts ActivitySummary kJ to kcal', () => {
    const parsed = parseShortcutPayload({
      schema: SHORTCUT_SCHEMA,
      schema_version: 1,
      days: [
        {
          date: '2026-09-09',
          activity_summary: { activeEnergyBurned: 418.4, unit: 'kJ' },
        },
      ],
    });
    expect(parsed.days[0].active_kcal).toBe(100);
    expect(parsed.days[0].sources).toEqual(['ActivitySummary']);
  });

  it('rejects the wrong schema name or version', () => {
    expect(() => parseShortcutPayload({ schema: 'other', schema_version: 1, days: [] })).toThrow(
      /Unknown Health JSON schema/,
    );
    expect(() =>
      parseShortcutPayload({ schema: SHORTCUT_SCHEMA, schema_version: 2, days: [{ date: '2026-09-03', active_kcal: 1 }] }),
    ).toThrow(/schema_version/);
    expect(() => parseShortcutJsonText('not json')).toThrow(/not valid JSON/);
  });

  it('routes .json files to the Shortcuts importer', () => {
    expect(looksLikeShortcutJsonFile(new File(['{}'], SHORTCUT_FILE_NAME, { type: 'application/json' }))).toBe(
      true,
    );
    expect(looksLikeShortcutJsonFile(new File(['{}'], 'export.zip', { type: 'application/zip' }))).toBe(false);
    expect(looksLikeShortcutJsonFile(new File(['<HealthData/>'], 'export.xml', { type: 'text/xml' }))).toBe(false);
  });
});

describe('Shortcuts JSON import into linda-health', () => {
  it('upserts daily_active_energy via putDaily', async () => {
    const repo = createMemoryHealthRepository();
    const file = new File([fixtureJson], SHORTCUT_FILE_NAME, { type: 'application/json' });
    const result = await importShortcutJson(file, repo, {
      fileName: SHORTCUT_FILE_NAME,
      now: new Date('2026-09-04T08:00:00+03:00'),
    });

    expect(result.daysWritten).toBe(1);
    expect(result.dates).toEqual(['2026-09-03']);
    expect(await repo.getDaily('2026-09-03')).toEqual({
      date: '2026-09-03',
      active_kcal: 487,
      sources: ['ActivitySummary', 'Apple Watch'],
    });
    expect(await repo.getMeta()).toMatchObject({
      fileName: SHORTCUT_FILE_NAME,
      newSamples: 1,
      sampleCount: 0,
    });

    await importShortcutJson(
      new File(
        [
          JSON.stringify({
            schema: SHORTCUT_SCHEMA,
            schema_version: 1,
            days: [{ date: '2026-09-03', active_kcal: 500, sources: ['ActivitySummary'] }],
          }),
        ],
        SHORTCUT_FILE_NAME,
        { type: 'application/json' },
      ),
      repo,
    );
    expect(await repo.getDaily('2026-09-03')).toMatchObject({ active_kcal: 500 });
  });
});

describe('Shortcuts JSON IndexedDB', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase('linda-health');
    resetHealthDbConnection();
  });

  it('writes the fixture into linda-health daily_active_energy', async () => {
    const repo = createHealthIndexedDbRepository();
    const file = new File([fixtureJson], SHORTCUT_FILE_NAME, { type: 'application/json' });
    await importShortcutJson(file, repo, { fileName: SHORTCUT_FILE_NAME });
    expect(await repo.getDaily('2026-09-03')).toEqual({
      date: '2026-09-03',
      active_kcal: 487,
      sources: ['ActivitySummary', 'Apple Watch'],
    });
    expect((await repo.getMeta())?.fileName).toBe(SHORTCUT_FILE_NAME);
  });
});
