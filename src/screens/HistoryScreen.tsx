import type { SessionDraft } from '../types/session';
import { LightBadge } from '../components/LightBadge';
import { TEMPLATE_DAY_LABELS, canonicalTemplateDay, formatDisplayDate } from '../domain/templateDay';
import { completedSetCount } from '../domain/sessionFactory';

export function HistoryScreen({
  sessions,
  onBack,
  onOpen,
}: {
  sessions: SessionDraft[];
  onBack: () => void;
  onOpen: (session: SessionDraft) => void;
}) {
  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Today
        </button>
        <h1>Session log</h1>
        <span />
      </header>

      {sessions.length === 0 ? (
        <section className="card">
          <p className="muted">No saved sessions yet. Finish today’s workout to persist one.</p>
        </section>
      ) : (
        <ul className="history-list">
          {sessions.map((s) => {
            const day = canonicalTemplateDay(s.template_day);
            const progress = completedSetCount(s);
            return (
              <li key={s.session_id}>
                <button type="button" className="history-row" onClick={() => onOpen(s)}>
                  <div>
                    <p className="kicker">{formatDisplayDate(s.date)}</p>
                    <strong>{TEMPLATE_DAY_LABELS[day]}</strong>
                    <p className="muted">
                      {progress.done}/{progress.total} sets
                    </p>
                  </div>
                  <LightBadge light={s.readiness.light} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export function DetailScreen({
  session,
  onBack,
}: {
  session: SessionDraft;
  onBack: () => void;
}) {
  const day = canonicalTemplateDay(session.template_day);
  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Log
        </button>
        <h1>{TEMPLATE_DAY_LABELS[day]}</h1>
        <span />
      </header>
      <p className="muted">{formatDisplayDate(session.date)}</p>
      <LightBadge light={session.readiness.light} large />
      {session.pain_flag ? <p className="pain-note">Pain flag on</p> : null}

      {session.lifts.map((lift) => (
        <section key={lift.exercise_id + lift.name} className="card">
          <h2>{lift.name}</h2>
          <ul className="detail-sets">
            {lift.sets.map((set, i) => (
              <li key={i} className={set.completed ? '' : 'dim'}>
                {i + 1}. {set.weight_kg > 0 ? `${set.weight_kg} kg` : 'BW'} × {set.reps}
                {set.amrap ? ' AMRAP' : ''} @ {set.rpe} RPE
                {set.completed ? '' : ' (not logged)'}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {session.notes ? (
        <section className="card">
          <p className="kicker">Notes</p>
          <p>{session.notes}</p>
        </section>
      ) : null}
    </main>
  );
}
