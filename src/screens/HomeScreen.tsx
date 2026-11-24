import { AppTabs } from '../components/AppTabs';
import { TemplatePicker } from '../components/TemplatePicker';
import { WorkoutPreview } from '../components/WorkoutPreview';
import { SessionBackupCard } from '../components/SessionBackupCard';
import { DAY_TEMPLATES } from '../data/templates';
import { trainingMaxesForBlock } from '../domain/cyclePlan';
import { blockWeekContext, dayTemplateForDate, isC1ReturnWeek, isC2Week, isDeloadWeek, isRecoveryWeek } from '../domain/programWeek';
import { C1_PICKER_NAMES } from '../domain/c1ReturnWeek';
import { C2_PICKER_NAMES } from '../domain/c2Week';
import { RECOVERY_PICKER_NAMES } from '../domain/recoveryWeek';
import { RecoveryCallout } from '../components/RecoveryCallout';
import { getMesocycleContext } from '../domain/phase2Calendar';
import { historyVisibilityLine, lastLogGapLine, type ImportMode } from '../domain/sessionBackup';
import { helsinkiCalendarDay, nov23FixPending, NOV23_DATE } from '../domain/nov23Session';
import { APP_BUILD_LABEL } from '../pwaCache';
import { plannedDayPreview, shouldOfferHomeWeek1Restore } from '../domain/workoutPreview';
import { formatDisplayDate, TEMPLATE_DAY_LABELS } from '../domain/templateDay';
import { localizePlanLabel } from '../domain/uiLang';
import type { CanonicalTemplateDay, SessionDraft, SessionLog } from '../types/session';
import { SEED_TRAINING_MAXES } from '../types/phase2';

export function HomeScreen({
  date,
  templateDay,
  onTemplateDay,
  draft,
  history = [],
  historyCount,
  onStart,
  onResume,
  onHistory,
  onDashboard = () => undefined,
  onBlockPreview,
  onInterval,
  onHealth,
  onImportSessions,
  onSeedWeek1,
  onSeedMon14,
  onSeedNov23 = async () => undefined,
  onCopyNov23 = async () => '',
  onSaveDraft = async () => undefined,
}: {
  date: string;
  templateDay: CanonicalTemplateDay;
  onTemplateDay: (day: CanonicalTemplateDay) => void;
  draft: SessionDraft | null;
  history?: readonly SessionLog[];
  historyCount: number;
  onStart: () => void;
  onResume: () => void;
  onHistory: () => void;
  onDashboard?: () => void;
  onBlockPreview: () => void;
  onInterval: () => void;
  onHealth: () => void;
  onImportSessions: (text: string, mode: ImportMode) => Promise<number>;
  onSeedWeek1: () => Promise<number>;
  onSeedMon14: () => Promise<number>;
  onSeedNov23?: () => Promise<unknown>;
  onCopyNov23?: () => Promise<string>;
  onSaveDraft?: () => Promise<void>;
}) {
  const template = DAY_TEMPLATES[templateDay];
  const planned = dayTemplateForDate(templateDay, date, { logs: history, hold: true });
  const meso = getMesocycleContext(date);
  const maxes = trainingMaxesForBlock(blockWeekContext(date)?.block ?? null);
  const offerWeek1Restore = shouldOfferHomeWeek1Restore(
    plannedDayPreview(template, history, date),
  );

  const recoveryCard = offerWeek1Restore ? (
    <SessionBackupCard
      compact
      historyCount={historyCount}
      onImport={onImportSessions}
      onSeed={onSeedWeek1}
      onSeedMon14={onSeedMon14}
    />
  ) : null;

  return (
    <main className="screen">
      <header className="hero">
        <p className="brand">Linda Lift</p>
        <h1>Today’s session</h1>
        <p className="muted">{formatDisplayDate(date)}</p>
        <p className={historyCount === 0 || offerWeek1Restore ? 'history-empty-note' : 'muted preview-lede'}>
          {offerWeek1Restore && historyCount > 0
            ? (lastLogGapLine(historyCount, 0) ?? historyVisibilityLine(historyCount))
            : historyVisibilityLine(historyCount)}
        </p>
        {meso.block && meso.phase ? (
          <p
            className={`phase-chip ${meso.training_mode === 'strength_peak' ? 'peak' : ''}`}
            title="Phase 2 calendar hook — engine not implemented"
          >
            Block {meso.block} · {meso.phase.replaceAll('_', ' ')}
            {meso.weekIndex ? ` · week ${meso.weekIndex}` : ''}
            {isDeloadWeek(date) ? ' · deload' : ''}
            {isRecoveryWeek(date) ? ' · recovery' : ''}
            {isC1ReturnWeek(date) ? ' · return' : ''}
            {isC2Week(date) ? ' · C2' : ''} ·{' '}
            {meso.training_mode.replaceAll('_', ' ')}
            {meso.freezeProgression ? ' · frozen' : ''}
          </p>
        ) : (
          <p
            className={`phase-chip ${meso.training_mode === 'strength_peak' ? 'peak' : 'dim'}`}
            title="Phase 2 calendar hook — engine not implemented"
          >
            Off-block · {meso.training_mode.replaceAll('_', ' ')}
          </p>
        )}
      </header>

      <AppTabs current="today" onToday={() => undefined} onDashboard={onDashboard} onLog={onHistory} />

      {draft ? (
        <section className="card resume-card">
          <p className="kicker">In progress</p>
          <h2>
            {TEMPLATE_DAY_LABELS[templateDayForDraft(draft)]}
          </h2>
          <p className="muted">
            Sets already logged are stored on this phone until you save or replace this draft.
          </p>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={onResume}>
              Resume
            </button>
            <button type="button" className="btn btn-ghost" data-testid="save-draft" onClick={() => void onSaveDraft()}>
              Save to log
            </button>
            {planned.slots.length > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={onStart}>
                New {template.weekday} session
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="card">
        <p className="kicker">Template day</p>
        <TemplatePicker
          value={templateDay}
          onChange={onTemplateDay}
          names={
            isRecoveryWeek(date)
              ? RECOVERY_PICKER_NAMES
              : isC1ReturnWeek(date)
                ? C1_PICKER_NAMES
                : isC2Week(date)
                  ? C2_PICKER_NAMES
                  : undefined
          }
        />
        <h2 className="template-heading">{planned.title}</h2>
        <p className="muted">{localizePlanLabel(planned.focus)}</p>
        <RecoveryCallout date={date} day={templateDay} />
        {planned.slots.length > 0 ? (
          <WorkoutPreview key={template.id} template={template} history={history} asOf={date} />
        ) : (
          <p className="muted">Nothing to log. Walk only.</p>
        )}
        {recoveryCard}
        {nov23FixPending(history) ? (
          <button
            type="button"
            className="btn btn-primary btn-block"
            data-testid="seed-nov23"
            onClick={() => void onSeedNov23()}
          >
            {history.some((row) => helsinkiCalendarDay(row.date) === NOV23_DATE)
              ? 'Repair Mon 23 Nov'
              : 'Add Mon 23 Nov to the log'}
          </button>
        ) : null}
        {planned.slots.length > 0 ? (
          <button type="button" className="btn btn-primary btn-block" onClick={onStart}>
            {draft ? 'Replace draft & start' : 'Start session'}
          </button>
        ) : null}
      </section>

      <button type="button" className="btn btn-ghost btn-block" onClick={onBlockPreview}>
        Block preview
      </button>

      <p className="tm-note">
        {maxes === SEED_TRAINING_MAXES ? 'Training maxes (docs only)' : 'Training maxes'}: squat{' '}
        {maxes.squat_kg} · bench {maxes.bench_kg} · deadlift {maxes.deadlift_kg} kg
      </p>

      <button type="button" className="btn btn-ghost btn-block" onClick={onHistory}>
        Session log ({historyCount})
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        data-testid="copy-nov23"
        onClick={() => void onCopyNov23()}
      >
        Copy diagnostics
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onInterval}>
        Interval timer
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onHealth}>
        Apple Health
      </button>
      <p className="build-stamp" data-testid="build-stamp">
        {APP_BUILD_LABEL}
      </p>
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
