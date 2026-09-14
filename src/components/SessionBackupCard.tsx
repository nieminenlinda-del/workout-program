import { useRef, useState } from 'react';
import type { ImportMode } from '../domain/sessionBackup';

export function SessionBackupCard({
  historyCount,
  showExport,
  compact,
  onExport,
  onImport,
  onSeed,
}: {
  historyCount: number;
  showExport?: boolean;
  compact?: boolean;
  onExport?: () => void;
  onImport: (text: string, mode: ImportMode) => Promise<number>;
  onSeed: () => Promise<number>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importModeRef = useRef<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(label: string, work: () => Promise<number>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const count = await work();
      if (count === 0) return;
      setNotice(`${label}: ${count} session${count === 1 ? '' : 's'} on this install.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the session log');
    } finally {
      setBusy(false);
    }
  }

  function pickFile(mode: ImportMode) {
    importModeRef.current = mode;
    inputRef.current?.click();
  }

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const mode = importModeRef.current;
    try {
      const text = await file.text();
      await run(mode === 'replace' ? 'Replaced from JSON' : 'Imported JSON', () =>
        onImport(text, mode),
      );
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className={compact ? 'recovery-block' : 'card'}>
      <p className="kicker">{compact ? 'This install' : 'Backup'}</p>
      <h2>{compact ? 'Session log empty' : 'Session JSON'}</h2>
      <p className="muted">
        {compact
          ? 'Last: needs past sessions in this PWA’s IndexedDB. Safari and Add to Home Screen are separate stores — exporting from one and importing here (or seeding Week 1 Last: reference) fills this log.'
          : 'Export this install’s completed sessions as JSON (same idea as Ravinto meal backup). Import merges by session id. Seed writes known Week 1 T1s as a Last: reference — not a claim that those accessory numbers were logged in the gym.'}
      </p>
      {historyCount === 0 && !compact ? (
        <p className="history-empty-note">
          Session log empty on this install (0) — Last: needs past sessions here (PWA ≠ Safari).
        </p>
      ) : null}

      <input
        ref={inputRef}
        className="file-input"
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={(event) => void onPick(event.target.files)}
      />

      <div className="row-actions">
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() =>
            void run('Seeded Week 1 Last: reference', () => {
              if (
                historyCount > 0 &&
                !window.confirm(
                  'Write the 4 Week 1 Last: reference sessions into this install? Same ids are replaced; other logs stay. Accessories are template placeholders, not gym-logged numbers.',
                )
              ) {
                return Promise.resolve(0);
              }
              return onSeed();
            })
          }
        >
          {busy ? 'Working…' : 'Seed Week 1 Last: reference'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          disabled={busy}
          onClick={() => pickFile('merge')}
        >
          Import session JSON
        </button>
        {showExport ? (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy || historyCount === 0}
            onClick={onExport}
          >
            Export session JSON
          </button>
        ) : null}
        {!compact ? (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  'Replace this install’s session log with the file? Drafts stay. Completed rows not in the file are deleted.',
                )
              ) {
                return;
              }
              pickFile('replace');
            }}
          >
            Import & replace
          </button>
        ) : null}
      </div>
      {notice ? <p className="muted">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
