import type { SessionDraft } from '../types/session';
import { completedSetCount } from '../domain/sessionFactory';
import { LightBadge } from '../components/LightBadge';
import { TEMPLATE_DAY_LABELS, canonicalTemplateDay, formatDisplayDate } from '../domain/templateDay';

export function SaveScreen({
  draft,
  error,
  onChange,
  onBack,
  onSave,
}: {
  draft: SessionDraft;
  error: string | null;
  onChange: (next: SessionDraft) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const progress = completedSetCount(draft);
  const day = canonicalTemplateDay(draft.template_day);

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Workout
        </button>
        <h1>Save session</h1>
        <span />
      </header>

      <section className="card">
        <p className="kicker">{formatDisplayDate(draft.date)}</p>
        <h2>{TEMPLATE_DAY_LABELS[day]}</h2>
        <p className="muted">
          {progress.done} of {progress.total} sets logged
        </p>
        <LightBadge light={draft.readiness.light} large />
        {draft.pain_flag ? <p className="pain-note">Pain flag on</p> : null}
      </section>

      <ul className="summary-lifts">
        {draft.lifts.map((lift) => {
          const done = lift.sets.filter((s) => s.completed);
          const top = done.reduce<(typeof done)[0] | null>((best, s) => {
            if (!best) return s;
            const load = s.weight_kg * s.reps;
            const bestLoad = best.weight_kg * best.reps;
            return load > bestLoad ? s : best;
          }, null);
          return (
            <li key={lift.exercise_id + lift.name}>
              <strong>{lift.name}</strong>
              <span>
                {done.length}/{lift.sets.length}
                {top ? ` · ${top.weight_kg}×${top.reps}` : ''}
              </span>
            </li>
          );
        })}
      </ul>

      <label className="notes-label" htmlFor="session-notes">
        Notes
      </label>
      <textarea
        id="session-notes"
        className="notes"
        rows={4}
        placeholder="Bar speed, depth, pain, anything for later…"
        value={draft.notes}
        onChange={(e) =>
          onChange({ ...draft, notes: e.target.value, updated_at: new Date().toISOString() })
        }
      />

      {error ? <p className="error">{error}</p> : null}

      <button type="button" className="btn btn-primary btn-block" onClick={onSave}>
        Save to this phone
      </button>
      <p className="tm-note">Stored locally in IndexedDB. No account, no cloud.</p>
    </main>
  );
}
