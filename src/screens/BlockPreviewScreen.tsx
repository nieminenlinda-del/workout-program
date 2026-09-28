import { useState } from 'react';
import {
  buildBlockPreview,
  type BlockPreviewSession,
  type BlockPreviewWeek,
} from '../domain/blockPreview';
import type { SessionLog } from '../types/session';

export function BlockPreviewScreen({
  asOf,
  history,
  onBack,
}: {
  asOf: string;
  history: readonly SessionLog[];
  onBack: () => void;
}) {
  const weeks = buildBlockPreview(asOf, history);

  return (
    <main className="screen block-preview-screen">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Today
        </button>
        <h1>Block preview</h1>
        <span />
      </header>

      <p className="muted block-preview-lede">
        This week through the 21 Nov test. Read-only — nothing here is logged.
      </p>
      <p className="muted block-preview-lede">
        Hypertrophy is Block A, Strength is Block B, Peak is Block C, Test is Saturday 21 Nov.
        Future weights say Projected — they are the planned table. Today can hold a Block B step
        when last week’s top set was above RPE 8.5.
      </p>

      {weeks.length === 0 ? (
        <p className="muted">Nothing left before the test.</p>
      ) : (
        weeks.map((week) => <WeekCard key={week.id} week={week} />)
      )}
    </main>
  );
}

function WeekCard({ week }: { week: BlockPreviewWeek }) {
  const [open, setOpen] = useState(week.current);

  return (
    <details
      className={`block-week${week.current ? ' current' : ''}${week.completed ? ' complete' : ''}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="block-week-copy">
          <span className="block-week-kicker">
            <span className="block-week-phase">{week.label}</span>
            <span className="block-badges">
              {week.current ? <span className="block-badge current">This week</span> : null}
              {week.deload ? <span className="block-badge deload">Deload</span> : null}
              {week.projected ? <span className="block-badge projected">Projected</span> : null}
              {week.completed ? <span className="block-badge logged">Logged</span> : null}
            </span>
          </span>
          <span className="block-week-meta">
            <span className="block-phase">{week.phaseLabel}</span>
            <span className="muted">{week.rangeLabel}</span>
          </span>
        </span>
        <span className="block-week-chevron" aria-hidden="true" />
      </summary>
      <div className="block-week-body">
        {week.sessions.map((session) => (
          <SessionCard key={`${session.date}-${session.templateDay}`} session={session} />
        ))}
      </div>
    </details>
  );
}

function SessionCard({ session }: { session: BlockPreviewSession }) {
  return (
    <article className="block-session">
      <p className="kicker">
        {session.phaseLabel}
        {session.projected ? ' · Projected' : ''}
        {session.completed ? ' · Logged' : ''}
      </p>
      <p className="block-session-title">{session.heading}</p>
      <p className="muted">{session.title}</p>
      {session.frozen && session.kind === 'train' ? (
        <p className="muted block-note">Frozen. Weight stays on the weekly target.</p>
      ) : null}
      {session.testNote ? <p className="block-note">{session.testNote}</p> : null}
      {session.exercises.length > 0 ? (
        <ul className="block-exercises">
          {session.exercises.map((exercise) => (
            <li key={exercise.slotId} className="block-ex">
              <span className="block-ex-name">
                <span className={`role-tag role-${exercise.role}`}>{exercise.role}</span>
                <strong>{exercise.name}</strong>
                {exercise.optional ? <em className="alt"> optional</em> : null}
              </span>
              <span className="block-ex-load">
                {exercise.workLabel}
                {exercise.rpeLabel ? ` · ${exercise.rpeLabel}` : ''}
                {exercise.projected ? <em className="projected-tag"> Projected</em> : null}
              </span>
              {exercise.warmupLabel ? <span className="muted block-note">{exercise.warmupLabel}</span> : null}
              {exercise.note ? <span className="block-note">{exercise.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {session.logged.length > 0 ? (
        <div className="block-logged">
          <p className="kicker">Logged</p>
          <ul>
            {session.logged.map((row, index) => (
              <li key={`${row.name}-${index}`}>
                <strong>{row.name}</strong>
                <span>{row.line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : !session.projected ? (
        <p className="muted block-note">No log for this day</p>
      ) : null}
    </article>
  );
}
