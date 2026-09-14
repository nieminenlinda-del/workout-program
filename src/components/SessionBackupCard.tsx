import { useRef, useState } from 'react';
import {
  A2HS_EMPTY_STORE_LINE,
  type ImportMode,
} from '../domain/sessionBackup';

export const RESTORE_WEEK1_BUTTON = 'Restore Week 1 weights';
export const RESTORE_WEEK1_DONE = 'Restored Week 1 weights';
export const RESTORE_MON14_BUTTON = 'Restore today’s Mon 14 Day A';
export const RESTORE_MON14_DONE = 'Restored today’s Mon 14 Day A';
export const RESTORE_WEEK1_TITLE_EMPTY = 'Session log empty — restore or import';
export const RESTORE_WEEK1_TITLE_MISSING_LAST = 'Last: missing on this install';
export const IMPORT_SESSION_JSON_BUTTON = 'Import session JSON';
export const RESTORE_WEEK1_CONFIRM =
  'Restore Week 1 weights? This writes known Week 1 T1s into this PWA’s Session log so Last: works. Same ids are replaced; other logs stay. Does not change Week 2 squat 57.5. Accessories are template placeholders, not gym-logged numbers.';
export const RESTORE_MON14_CONFIRM =
  'Restore today’s Mon 14 Day A? This writes a reconstructed Day A dated 14 Sep 2026 (squat 57.5×3×4 @7 soft GREEN, RDL 50×8×3 @6, reverse lunge 37.5×8×3 @7, plank 5 kg). Same id is replaced. Known gym-logged numbers. Does not change Week 2 squat 57.5.';
export const RESTORE_WEEK1_HELPER_COMPACT =
  'Last: needs matching prior work in this PWA’s Session log — a saved session that is not Week 1 T1s still shows No prior log. Home-screen store ≠ Safari. Restore Week 1 weights writes known Week 1 T1s here so Last: works — it does not change Week 2 squat 57.5.';
export const RESTORE_EMPTY_HELPER_COMPACT =
  `This install’s Session log is empty (0). iOS standalone IndexedDB is local only — there is no server backup. Restore Week 1 weights (Last: for this week), restore today’s Mon 14 Day A (reconstructed gym day), or import session JSON below. ${A2HS_EMPTY_STORE_LINE} Does not change Week 2 squat 57.5.`;
export const RESTORE_WEEK1_HELPER =
  `Export this install’s completed sessions as JSON (same idea as Ravinto meal backup). Import merges by session id. Restore Week 1 weights writes known Week 1 T1s so Last: works. Restore today’s Mon 14 Day A writes a reconstructed Day A (squat 57.5×3×4 @7, RDL 50×8×3 @6, reverse lunge 37.5×8×3 @7, plank 5 kg). Home-screen store ≠ Safari. ${A2HS_EMPTY_STORE_LINE} Does not change Week 2 squat 57.5.`;
export const RESTORE_EMPTY_NOTE =
  `Session log empty on this install (0) — Restore Week 1 weights, restore today’s Mon 14 Day A, or import session JSON here. Last: cannot fill in. ${A2HS_EMPTY_STORE_LINE}`;

export function SessionBackupCard({
  historyCount,
  showExport,
  compact,
  onExport,
  onImport,
  onSeed,
  onSeedMon14,
}: {
  historyCount: number;
  showExport?: boolean;
  compact?: boolean;
  onExport?: () => void;
  onImport: (text: string, mode: ImportMode) => Promise<number>;
  onSeed: () => Promise<number>;
  onSeedMon14: () => Promise<number>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importModeRef = useRef<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const empty = historyCount === 0;

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

  const helper = compact
    ? empty
      ? RESTORE_EMPTY_HELPER_COMPACT
      : RESTORE_WEEK1_HELPER_COMPACT
    : RESTORE_WEEK1_HELPER;

  return (
    <section className={compact ? `recovery-block${empty ? ' recovery-block-empty' : ''}` : 'card'}>
      <p className="kicker">{compact ? 'This install' : 'Backup'}</p>
      <h2>
        {compact
          ? empty
            ? RESTORE_WEEK1_TITLE_EMPTY
            : RESTORE_WEEK1_TITLE_MISSING_LAST
          : empty
            ? RESTORE_WEEK1_TITLE_EMPTY
            : 'Session JSON'}
      </h2>
      <p className="muted">{helper}</p>
      {empty ? <p className="history-empty-note">{RESTORE_EMPTY_NOTE}</p> : null}

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
            void run(RESTORE_WEEK1_DONE, () => {
              if (historyCount > 0 && !window.confirm(RESTORE_WEEK1_CONFIRM)) {
                return Promise.resolve(0);
              }
              return onSeed();
            })
          }
        >
          {busy ? 'Working…' : RESTORE_WEEK1_BUTTON}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() =>
            void run(RESTORE_MON14_DONE, () => {
              if (historyCount > 0 && !window.confirm(RESTORE_MON14_CONFIRM)) {
                return Promise.resolve(0);
              }
              return onSeedMon14();
            })
          }
        >
          {busy ? 'Working…' : RESTORE_MON14_BUTTON}
        </button>
        <button
          type="button"
          className={`btn btn-block ${empty ? 'btn-primary' : 'btn-ghost'}`}
          disabled={busy}
          onClick={() => pickFile('merge')}
        >
          {IMPORT_SESSION_JSON_BUTTON}
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
