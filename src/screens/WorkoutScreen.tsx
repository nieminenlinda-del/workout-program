import { useMemo, useState } from 'react';
import type { LoggedLift, SessionDraft, SessionLog } from '../types/session';
import { isTimedHold, type ExerciseId } from '../types/exercises';
import { DAY_TEMPLATES, exerciseName, type DayTemplate } from '../data/templates';
import { canonicalTemplateDay } from '../domain/templateDay';
import { completedSetCount, swapLiftExercise } from '../domain/sessionFactory';
import { lastMatchingPerformance } from '../domain/lastPerformance';
import { laterSameKindUnlogged, setDisplayLabel, workSets } from '../domain/sets';
import {
  formatLoggedLoad,
  formatPlanLoad,
  loggedDiffersFromPlan,
  prescriptionWeightKg,
} from '../domain/setPrescription';
import { logSetOnDraft, overrideUnloggedLiftWeight } from '../domain/weightOverride';
import { SetLogger } from '../components/SetLogger';
import { RestTimer } from '../components/RestTimer';
import { LightBadge } from '../components/LightBadge';
import { NumberStepper } from '../components/NumberStepper';
import { LastPerformanceHint } from '../components/LastPerformanceHint';
import { unlockTimerAudio } from '../domain/timerCue';

interface ActiveSet {
  liftIndex: number;
  setIndex: number;
}

export function WorkoutScreen({
  draft,
  history = [],
  onChange,
  onBack,
  onInterval,
  onFinish,
}: {
  draft: SessionDraft;
  history?: readonly SessionLog[];
  onChange: (next: SessionDraft) => void;
  onBack: () => void;
  onInterval: () => void;
  onFinish: () => void;
}) {
  const [active, setActive] = useState<ActiveSet | null>(null);
  const [rest, setRest] = useState<{ seconds: number; name: string } | null>(null);
  const [openLift, setOpenLift] = useState(0);

  const day = canonicalTemplateDay(draft.template_day);
  const template = DAY_TEMPLATES[day];
  const progress = completedSetCount(draft);

  const lastByExercise = useMemo(() => {
    const ids = draft.lifts.map((lift) => lift.exercise_id);
    const map = new Map<ExerciseId, ReturnType<typeof lastMatchingPerformance>>();
    for (const id of ids) {
      map.set(id, lastMatchingPerformance(history, id, day, draft.date));
    }
    return map;
  }, [history, day, draft.date, draft.lifts]);

  const completeSet = (liftIndex: number, setIndex: number, logged: Parameters<typeof logSetOnDraft>[3], applyRemaining: boolean) => {
    const next = logSetOnDraft(draft, liftIndex, setIndex, logged, applyRemaining);
    onChange(next);
    setActive(null);
    unlockTimerAudio();
    const restSec =
      slotForLift(template, draft.lifts[liftIndex])?.sets[setIndex]?.rest_sec ?? 90;
    setRest({ seconds: restSec, name: draft.lifts[liftIndex]?.name ?? 'Lift' });
  };

  const skipOptional = (liftIndex: number) => {
    const lifts = draft.lifts.filter((_, i) => i !== liftIndex);
    onChange({ ...draft, lifts, updated_at: new Date().toISOString() });
    setOpenLift(0);
  };

  return (
    <main className="screen workout-screen">
      <div className="workout-header">
        <header className="topbar">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Readiness
          </button>
          <h1>{template.title}</h1>
          <LightBadge light={draft.readiness.light} />
        </header>

        <div className="workout-chrome">
          <div className="progress-line" aria-label={`${progress.done} of ${progress.total} sets`}>
            <div className="progress-bar" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
            <span>
              {progress.done}/{progress.total} sets
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-slim workout-interval-btn" onClick={onInterval}>
            Interval
          </button>
        </div>
      </div>

      {draft.lifts.map((lift, liftIndex) => {
        const slot = slotForLift(template, lift) ?? template.slots[liftIndex];
        const expanded = openLift === liftIndex;
        const last = lastByExercise.get(lift.exercise_id) ?? null;
        const work = workSets(lift.sets);
        const workDone = work.filter((s) => s.completed).length;
        const warmups = lift.sets.filter((s) => s.warmup);
        const warmupDone = warmups.filter((s) => s.completed).length;
        const unloggedWork = work.filter((s) => !s.completed);
        const timed = isTimedHold(lift.exercise_id);
        const workingKg = unloggedWork[0]
          ? prescriptionWeightKg(unloggedWork[0])
          : (work[work.length - 1]?.weight_kg ?? 0);
        return (
          <section key={`${lift.exercise_id}-${liftIndex}`} className={`card lift-card ${expanded ? 'open' : ''}`}>
            <button
              type="button"
              className="lift-head"
              onClick={() => setOpenLift(expanded ? -1 : liftIndex)}
            >
              <div>
                <p className="kicker">{slot?.role ?? 'lift'}</p>
                <h2>{lift.name}</h2>
                <LastPerformanceHint performance={last} />
              </div>
              <span className="lift-count">
                {workDone}/{work.length || lift.sets.length}
                {warmups.length > 0 ? (
                  <em className="warmup-count">
                    W {warmupDone}/{warmups.length}
                  </em>
                ) : null}
              </span>
            </button>

            {slot && slot.alternatives.length > 0 ? (
              <div className="alt-row">
                {[slot.exercise_id, ...slot.alternatives].map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`chip ${lift.exercise_id === id ? 'selected' : ''}`}
                    onClick={() => onChange(swapLiftExercise(draft, liftIndex, id as ExerciseId))}
                  >
                    {exerciseName(id)}
                  </button>
                ))}
              </div>
            ) : null}

            {slot?.optional ? (
              <button type="button" className="btn btn-ghost btn-slim" onClick={() => skipOptional(liftIndex)}>
                Skip optional
              </button>
            ) : null}

            {expanded && unloggedWork.length > 0 ? (
              <NumberStepper
                label="Working weight"
                value={workingKg}
                onChange={(kg) => onChange(overrideUnloggedLiftWeight(draft, liftIndex, kg))}
                step={2.5}
                suffix="kg"
                hint="Edits leftover work sets. Unused warmups follow the new W."
              />
            ) : null}

            {expanded
              ? lift.sets.map((set, setIndex) => (
                  <button
                    key={setIndex}
                    type="button"
                    className={`set-row ${set.completed ? 'done' : ''} ${set.warmup ? 'warmup' : ''}`}
                    onClick={() => setActive({ liftIndex, setIndex })}
                  >
                    <span className={`set-num ${set.warmup ? 'warmup-num' : ''}`}>
                      {setDisplayLabel(lift.sets, setIndex)}
                    </span>
                    <span className="set-main">
                      {set.completed ? (
                        <>
                          <span>
                            {formatLoggedLoad(set, timed)}
                            <em> @ {set.rpe} RPE</em>
                          </span>
                          {loggedDiffersFromPlan(set) ? (
                            <span className="set-plan">plan {formatPlanLoad(set, timed)}</span>
                          ) : null}
                        </>
                      ) : (
                        <span>
                          <span className="set-plan-label">Plan</span> {formatPlanLoad(set, timed)}
                          <em> @ {set.rpe} RPE</em>
                        </span>
                      )}
                    </span>
                    <span className="set-state">
                      {set.completed ? 'Logged' : set.warmup ? 'Warmup' : 'Log'}
                    </span>
                  </button>
                ))
              : null}
          </section>
        );
      })}

      <div className="workout-footer">
        <button type="button" className="btn btn-ghost btn-block" onClick={onInterval}>
          Interval timer
        </button>
        <button type="button" className="btn btn-primary btn-block" onClick={onFinish}>
          Review & save
        </button>
      </div>

      {active ? (
        <SetLogger
          exerciseName={draft.lifts[active.liftIndex]?.name ?? 'Lift'}
          setLabel={setDisplayLabel(draft.lifts[active.liftIndex]?.sets ?? [], active.setIndex)}
          setCount={
            (draft.lifts[active.liftIndex]?.sets[active.setIndex]?.warmup
              ? draft.lifts[active.liftIndex]?.sets.filter((s) => s.warmup).length
              : draft.lifts[active.liftIndex]?.sets.filter((s) => !s.warmup).length) ?? 0
          }
          initial={draft.lifts[active.liftIndex].sets[active.setIndex]}
          lastPerformance={lastByExercise.get(draft.lifts[active.liftIndex].exercise_id) ?? null}
          hasLaterSameKind={laterSameKindUnlogged(
            draft.lifts[active.liftIndex]?.sets ?? [],
            active.setIndex,
          )}
          timed={isTimedHold(draft.lifts[active.liftIndex].exercise_id)}
          onCancel={() => setActive(null)}
          onComplete={(logged, applyRemaining) =>
            completeSet(active.liftIndex, active.setIndex, logged, applyRemaining)
          }
        />
      ) : null}

      {rest ? (
        <RestTimer seconds={rest.seconds} exerciseName={rest.name} onDone={() => setRest(null)} />
      ) : null}
    </main>
  );
}

function slotForLift(template: DayTemplate, lift: LoggedLift) {
  return template.slots.find(
    (s) => s.exercise_id === lift.exercise_id || s.alternatives.includes(lift.exercise_id),
  );
}
