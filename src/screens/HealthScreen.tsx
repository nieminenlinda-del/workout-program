import { HEALTH_LOOKBACK_DAYS } from '../health/constants';
import { addCalendarDays, helsinkiToday } from '../health/dates';
import { createHealthIndexedDbRepository } from '../health/indexedDbRepository';
import { importShortcutJson } from '../health/parse/importShortcut';
import { looksLikeShortcutJsonFile } from '../health/parse/shortcutJson';
import { importHealthFileInWorker } from '../health/parse/workerClient';
import { lastNTrainingDays } from '../health/trainingDayJoin';
import type { ImportMeta, ImportProgress, TrainingDayEnergy } from '../health/types';
import { formatDisplayDate } from '../domain/templateDay';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function formatKcal(value: number): string {
  if (value === 0) return '—';
  return `${Math.round(value)} kcal`;
}

function formatStamp(iso?: string): string {
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HealthScreen({ onBack }: { onBack: () => void }) {
  const repo = useMemo(() => createHealthIndexedDbRepository(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [days, setDays] = useState<TrainingDayEnergy[]>([]);
  const [meta, setMeta] = useState<ImportMeta | undefined>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const asOf = helsinkiToday();
    const start = addCalendarDays(asOf, -(HEALTH_LOOKBACK_DAYS - 1));
    const daily = await repo.listDailyRange(start, asOf);
    setDays(lastNTrainingDays(daily, HEALTH_LOOKBACK_DAYS, asOf));
    setMeta(await repo.getMeta());
  }, [repo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onPick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (looksLikeShortcutJsonFile(file)) {
        await importShortcutJson(file, repo, { fileName: file.name });
      } else {
        setProgress({ phase: 'unzip', parsed: 0, written: 0, newSamples: 0, duplicates: 0 });
        await importHealthFileInWorker(file, setProgress);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import this Health file');
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Today
        </button>
        <h1>Apple Health</h1>
        <span />
      </header>

      <p className="lede">
        Import daily active energy on this phone into the shared <code>linda-health</code> store so
        Ravinto can read the same numbers. Prefer the iOS Shortcuts JSON from iCloud Drive; a full
        Health export still works.
      </p>

      <section className="card">
        <p className="kicker">Import file</p>
        <p className="muted">
          Daily path: run the <strong>Linda Health Sync</strong> Shortcut, then pick{' '}
          <code>linda-health-shortcut.json</code> from iCloud Drive (Linda Health folder). Same
          file also works in Ravinto.
        </p>
        <p className="muted">
          Occasional full dump: Health app → profile photo → Export All Health Data. Pick the{' '}
          <code>.zip</code> (or <code>export.xml</code>). Full exports can be hundreds of MB —
          parsing streams in a background worker. GPS workout routes are skipped.
        </p>
        <input
          ref={inputRef}
          className="file-input"
          type="file"
          accept=".zip,.xml,.json,application/zip,text/xml,application/xml,application/json"
          disabled={busy}
          onChange={(event) => void onPick(event.target.files)}
        />
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Importing…' : 'Import Health file'}
        </button>
        {busy && progress ? (
          <p className="muted">
            {progress.phase === 'unzip' ? 'Opening archive…' : null}
            {progress.phase === 'parse' || progress.phase === 'save'
              ? `Parsed ${progress.parsed.toLocaleString()} records · ${progress.newSamples.toLocaleString()} new`
              : null}
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card">
        <p className="kicker">Last import</p>
        {meta ? (
          <>
            <p>
              {formatStamp(meta.lastImportAt)}
              {meta.fileName ? ` · ${meta.fileName}` : ''}
            </p>
            <p className="muted">
              {meta.exportDate ? `Export date ${formatStamp(meta.exportDate)} · ` : null}
              {meta.fileName?.toLowerCase().endsWith('.json')
                ? `${(meta.newSamples ?? 0).toLocaleString()} day${meta.newSamples === 1 ? '' : 's'} from Shortcuts`
                : `${meta.sampleCount.toLocaleString()} samples stored`}
            </p>
          </>
        ) : (
          <p className="muted">
            Nothing imported yet. Import <code>linda-health-shortcut.json</code> or a Health export.
          </p>
        )}
      </section>

      <section className="card">
        <p className="kicker">Last {HEALTH_LOOKBACK_DAYS} days</p>
        <p className="muted">Active energy, labeled with Linda Lift A–D (Mon/Tue/Thu/Fri) vs rest.</p>
        <ul className="energy-list">
          {days.map((row) => (
            <li key={row.date} className="energy-row">
              <div>
                <p className="kicker">{formatDisplayDate(row.date)}</p>
                <strong>
                  {row.template_day === 'rest' ? 'Rest' : `Day ${row.template_day}`}
                </strong>
                <p className={`day-kind ${row.template_day === 'rest' ? 'rest' : 'train'}`}>
                  {row.template_day === 'rest' ? 'rest' : 'training'}
                </p>
              </div>
              <span className="kcal">{formatKcal(row.active_kcal)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
