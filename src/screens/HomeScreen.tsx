import { PlannedSessionCard } from '../components/PlannedSessionCard';
import { getMesocycleContext } from '../domain/phase2Calendar';
import { formatDisplayDate, TEMPLATE_DAY_LABELS, WEEKDAY_BY_LETTER } from '../domain/templateDay';
import type { CanonicalTemplateDay, SessionDraft } from '../types/session';
import { SEED_TRAINING_MAXES } from '../types/phase2';

export function HomeScreen({
  date,
  templateDay,
  onTemplateDay,
  draft,
  historyCount,
  onStart,
  onResume,
  onHistory,
  onInterval,
  onHealth,
}: {
  date: string;
  templateDay: CanonicalTemplateDay;
  onTemplateDay: (day: CanonicalTemplateDay) => void;
  draft: SessionDraft | null;
  historyCount: number;
  onStart: () => void;
  onResume: () => void;
  onHistory: () => void;
  onInterval: () => void;
  onHealth: () => void;
}) {
  const meso = getMesocycleContext(date);

  return (
    <main className="screen">
      <header className="hero">
        <p className="brand">Linda Lift</p>
        <h1>Today’s session</h1>
        <p className="muted">{formatDisplayDate(date)}</p>
        {meso.block && meso.phase ? (
          <p className="phase-chip" title="Phase 2 calendar hook — engine not implemented">
            Block {meso.block} · {meso.phase.replaceAll('_', ' ')} ·{' '}
            {meso.training_mode.replaceAll('_', ' ')}
            {meso.freezeProgression ? ' · frozen' : ''}
          </p>
        ) : (
          <p className="phase-chip dim" title="Phase 2 calendar hook — engine not implemented">
            Off-block · {meso.training_mode.replaceAll('_', ' ')}
          </p>
        )}
      </header>

      {draft ? (
        <section className="card resume-card">
          <p className="kicker">In progress</p>
          <h2>
            {TEMPLATE_DAY_LABELS[templateDayForDraft(draft)]}
          </h2>
          <p className="muted">Draft saved on this phone. Resume or start over.</p>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={onResume}>
              Resume
            </button>
            <button type="button" className="btn btn-ghost" onClick={onStart}>
              New {WEEKDAY_BY_LETTER[templateDay]} session
            </button>
          </div>
        </section>
      ) : null}

      <PlannedSessionCard
        templateDay={templateDay}
        onTemplateDay={onTemplateDay}
        draft={draft}
        onStart={onStart}
      />

      <p className="tm-note">
        Training maxes (docs only): squat {SEED_TRAINING_MAXES.squat_kg} · bench{' '}
        {SEED_TRAINING_MAXES.bench_kg} · deadlift {SEED_TRAINING_MAXES.deadlift_kg} kg
      </p>

      <button type="button" className="btn btn-ghost btn-block" onClick={onHistory}>
        Session log{historyCount ? ` (${historyCount})` : ''}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onInterval}>
        Interval timer
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onHealth}>
        Apple Health
      </button>
    </main>
  );
}

function templateDayForDraft(draft: SessionDraft): CanonicalTemplateDay {
  const d = draft.template_day;
  if (d === 'A' || d === 'B' || d === 'C' || d === 'D') return d;
  if (d === 'Mon') return 'A';
  if (d === 'Tue') return 'B';
  if (d === 'Thu') return 'C';
  return 'D';
}
