import { useMemo, useState } from 'react';
import { countsTowardTrainingMax, type LoggedLift, type SessionDraft, type SessionLog } from '../types/session';
import { isAssistedLoad, isTimedHold, type ExerciseId } from '../types/exercises';
import { exerciseName, type DayTemplate } from '../data/templates';
import { canonicalTemplateDay } from '../domain/templateDay';
import { RecoveryCallout } from '../components/RecoveryCallout';
import { dayTemplateForDate } from '../domain/programWeek';
import { completedSetCount, isBarbellSquatId, setSquatBarPosition, swapLiftExercise } from '../domain/sessionFactory';
import { effectiveBarPosition } from '../domain/dashboard';
import { lastMatchingPerformance } from '../domain/lastPerformance';
import { laterSameKindUnlogged, setDisplayLabel, workSets } from '../domain/sets';
import {
  formatLoggedLoad,
  formatPlanLoad,
  formatShownRpe,
  loggedDiffersFromPlan,
  prescriptionWeightKg,
} from '../domain/setPrescription';
import { logSetOnDraft, overrideUnloggedLiftWeight } from '../domain/weightOverride';
import {
  addManualExercise,
  addWorkSet,
  canRemoveSet,
  removeLastUnloggedSet,
  removeManualExercise,
  restSecondsForSet,
  type ManualExerciseInput,
} from '../domain/sessionEdits';
import {
  equipmentOptionsForSlot,
  exerciseForEquipment,
  liftEquipment,
  loadPreferredBarKg,
  setLiftBarKg,
  slotAllowsEquipmentPicker,
} from '../domain/equipment';
import { SetLogger } from '../components/SetLogger';
import { VbtTracker } from '../components/VbtTracker';
import { loadVelocityPoints } from '../domain/vbt/history';
import { attachVbtSet } from '../domain/vbt/log';
import type { VbtLiftKind } from '../domain/vbt/reps';
import { readVbtSettings } from '../domain/vbt/settings';
import { RestTimer } from '../components/RestTimer';
import { LightBadge } from '../components/LightBadge';
import { NumberStepper } from '../components/NumberStepper';
import { LastPerformanceHint } from '../components/LastPerformanceHint';
import { EquipmentPicker } from '../components/EquipmentPicker';
import { PainFields } from '../components/PainFields';
import { unlockTimerAudio } from '../domain/timerCue';
import { inSessionJumpHint } from '../domain/accessoryProgression';

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
  const [vbt, setVbt] = useState<ActiveSet | null>(null);
  const [videoToast, setVideoToast] = useState<string | null>(null);
  const [rest, setRest] = useState<{ seconds: number; name: string } | null>(null);
  const [openLift, setOpenLift] = useState(0);
  const [addingExercise, setAddingExercise] = useState(false);

  const day = canonicalTemplateDay(draft.template_day);
  const template = dayTemplateForDate(day, draft.date, { logs: history, hold: true });
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
    let next = logSetOnDraft(draft, liftIndex, setIndex, logged, applyRemaining);
    if (liftEquipment(next.lifts[liftIndex] ?? draft.lifts[liftIndex]) === 'barbell') {
      next = setLiftBarKg(next, liftIndex, next.lifts[liftIndex]?.bar_kg ?? loadPreferredBarKg());
    }
    onChange(next);
    setActive(null);
    unlockTimerAudio();
    const restSec = restSecondsForSet(
      slotForLift(template, draft.lifts[liftIndex], liftIndex)?.sets,
      setIndex,
    );
    setRest({ seconds: restSec, name: draft.lifts[liftIndex]?.name ?? 'Lift' });
  };

  const skipOptional = (liftIndex: number) => {
    const lifts = draft.lifts.filter((_, i) => i !== liftIndex);
    onChange({ ...draft, lifts, updated_at: new Date().toISOString() });
    setOpenLift(0);
  };

  const activeLift = active ? draft.lifts[active.liftIndex] : undefined;
  const activeSlot = active && activeLift ? slotForLift(template, activeLift, active.liftIndex) : undefined;
  const activeEquipOptions =
    activeSlot && slotAllowsEquipmentPicker(activeSlot) ? equipmentOptionsForSlot(activeSlot) : [];

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

        <RecoveryCallout date={draft.date} day={day} />
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

      <div className="workout-lifts">
      <PainFields draft={draft} onChange={onChange} />
      {draft.lifts.map((lift, liftIndex) => {
        const slot = slotForLift(template, lift, liftIndex);
        const expanded = openLift === liftIndex;
        const last = lastByExercise.get(lift.exercise_id) ?? null;
        const work = workSets(lift.sets);
        const workDone = work.filter((s) => s.completed).length;
        const warmups = lift.sets.filter((s) => s.warmup);
        const warmupDone = warmups.filter((s) => s.completed).length;
        const unloggedWork = work.filter((s) => !s.completed);
        const timed = isTimedHold(lift.exercise_id);
        const assisted = isAssistedLoad(lift.exercise_id);
        const workingKg = unloggedWork[0]
          ? prescriptionWeightKg(unloggedWork[0])
          : (work[work.length - 1]?.weight_kg ?? 0);
        const jumpHint = countsTowardTrainingMax(draft)
          ? inSessionJumpHint(
              lift.exercise_id,
              workingKg,
              unloggedWork[0]?.reps ?? work[work.length - 1]?.reps ?? 0,
              work
                .filter((set) => set.completed && typeof set.rpe === 'number')
                .map((set) => set.rpe as number),
              unloggedWork.length,
            )
          : null;
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
                {slot?.note ? <p className="muted">{slot.note}</p> : null}
                <LastPerformanceHint performance={slot?.volumeKind === 'backoff' ? null : last} />
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

            {isBarbellSquatId(lift.exercise_id) ? (
              <div className="bar-position" data-field="bar-position">
                <p className="kicker">Bar position</p>
                <div className="alt-row" role="group" aria-label="Squat bar position">
                  {(['low_bar', 'high_bar'] as const).map((position) => (
                    <button
                      key={position}
                      type="button"
                      className={`chip ${effectiveBarPosition(lift) === position ? 'selected' : ''}`}
                      onClick={() => onChange(setSquatBarPosition(draft, liftIndex, position))}
                    >
                      {position === 'low_bar' ? 'Low-bar' : 'High-bar'}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {jumpHint ? <p className="muted">{jumpHint}</p> : null}

            {slot && slotAllowsEquipmentPicker(slot) && equipmentOptionsForSlot(slot).length > 1 ? (
              <EquipmentPicker
                variant="segment"
                options={equipmentOptionsForSlot(slot)}
                value={liftEquipment(lift)}
                onChange={(eq) => {
                  const nextId = exerciseForEquipment(slot, eq, lift.exercise_id);
                  if (nextId && nextId !== lift.exercise_id) {
                    onChange(swapLiftExercise(draft, liftIndex, nextId));
                  }
                }}
              />
            ) : null}

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

            {expanded && vbtKindFor(lift.exercise_id) && unloggedWork.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => {
                  const setIndex = lift.sets.findIndex((set) => !set.warmup && !set.completed);
                  if (setIndex >= 0) setVbt({ liftIndex, setIndex });
                }}
              >
                Track with camera
              </button>
            ) : null}

            {expanded && unloggedWork.length > 0 ? (
              <NumberStepper
                label={
                  assisted
                    ? 'Assistance'
                    : timed || liftEquipment(lift) === 'bodyweight'
                      ? 'Added weight'
                      : 'Working weight'
                }
                value={workingKg}
                onChange={(kg) => onChange(overrideUnloggedLiftWeight(draft, liftIndex, kg))}
                step={2.5}
                suffix="kg"
                hint={
                  assisted
                    ? 'Kg that helps you up (cable plates). 0 is unassisted. Leftover sets can differ.'
                    : timed
                      ? '0 is bodyweight. Add kg for a plate or vest on leftover holds.'
                      : 'Edits leftover work sets. Unused warmups follow the new W.'
                }
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
                      {set.part_label ?? setDisplayLabel(lift.sets, setIndex)}
                    </span>
                    <span className="set-main">
                      {set.completed ? (
                        <>
                          <span>
                            {formatLoggedLoad(set, timed, assisted)}
                            {typeof set.rpe === 'number' ? <em> @ {set.rpe} RPE</em> : null}
                            {set.part_label?.toLowerCase() === 'belt' ? ' belt' : ''}
                            {lift.each_side ? ' each side' : ''}
                          </span>
                          {loggedDiffersFromPlan(set) ? (
                            <span className="set-plan">plan {formatPlanLoad(set, timed, assisted)}</span>
                          ) : null}
                        </>
                      ) : (
                        <span>
                          <span className="set-plan-label">Plan</span>{' '}
                          {set.weight_label
                            ? `${set.weight_label} kg × ${set.reps}${set.amrap ? '+' : ''}`
                            : formatPlanLoad(set, timed, assisted)}
                          <em> @ {formatShownRpe(set)} RPE</em>
                          {lift.each_side ? ' each side' : ''}
                        </span>
                      )}
                    </span>
                    <span className="set-state">
                      {set.completed ? 'Logged' : set.warmup ? 'Warmup' : 'Log'}
                    </span>
                  </button>
                ))
              : null}
            {expanded ? (
              <div className="set-edit-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  data-testid="add-set"
                  onClick={() => onChange(addWorkSet(draft, liftIndex))}
                >
                  Add set
                </button>
                {canRemoveSet(lift) ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    data-testid="remove-set"
                    onClick={() => {
                      onChange(removeLastUnloggedSet(draft, liftIndex));
                      if (active?.liftIndex === liftIndex) setActive(null);
                      if (vbt?.liftIndex === liftIndex) setVbt(null);
                    }}
                  >
                    Remove set
                  </button>
                ) : null}
                {lift.manual && !lift.sets.some((set) => set.completed) ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    data-testid="remove-exercise"
                    onClick={() => {
                      onChange(removeManualExercise(draft, liftIndex));
                      setOpenLift(0);
                      if (active?.liftIndex === liftIndex) setActive(null);
                    }}
                  >
                    Remove exercise
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
      {addingExercise ? (
        <ManualExerciseForm
          onCancel={() => setAddingExercise(false)}
          onAdd={(input) => {
            const next = addManualExercise(draft, input);
            if (next === draft) return;
            onChange(next);
            setOpenLift(next.lifts.length - 1);
            setAddingExercise(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          data-testid="add-exercise"
          onClick={() => setAddingExercise(true)}
        >
          Add exercise
        </button>
      )}
      </div>

      <div className="workout-footer">
        <button type="button" className="btn btn-ghost btn-block" onClick={onInterval}>
          Interval timer
        </button>
        <button type="button" className="btn btn-primary btn-block" onClick={onFinish}>
          Review & save
        </button>
      </div>

      {vbt && draft.lifts[vbt.liftIndex] ? (
        <VbtTracker
          kind={vbtKindFor(draft.lifts[vbt.liftIndex]?.exercise_id ?? 'squat_low_bar') ?? 'squat'}
          liftName={draft.lifts[vbt.liftIndex]?.name ?? 'Lift'}
          targetReps={draft.lifts[vbt.liftIndex]?.sets[vbt.setIndex]?.reps ?? 0}
          loadKg={draft.lifts[vbt.liftIndex]?.sets[vbt.setIndex]?.weight_kg ?? 0}
          date={draft.date}
          setNumber={vbt.setIndex + 1}
          minVelocity={
            readVbtSettings().min_velocity_m_s[
              vbtKindFor(draft.lifts[vbt.liftIndex]?.exercise_id ?? 'squat_low_bar') ?? 'squat'
            ]
          }
          priorPoints={loadVelocityPoints(
            [...history, draft],
            vbtKindFor(draft.lifts[vbt.liftIndex]?.exercise_id ?? 'squat_low_bar') ?? 'squat',
          )}
          onCancel={() => setVbt(null)}
          onSave={(summary, view, correction) => {
            const load = draft.lifts[vbt.liftIndex]?.sets[vbt.setIndex]?.weight_kg ?? 0;
            onChange(attachVbtSet(draft, vbt.liftIndex, vbt.setIndex, summary, load, view, correction));
            const restSec = restSecondsForSet(
              slotForLift(template, draft.lifts[vbt.liftIndex], vbt.liftIndex)?.sets,
              vbt.setIndex,
            );
            unlockTimerAudio();
            setRest({ seconds: restSec, name: draft.lifts[vbt.liftIndex]?.name ?? 'Lift' });
            setVbt(null);
          }}
          onVideoSkipped={() => {
            setVideoToast('Set saved, video not saved');
            window.setTimeout(() => setVideoToast(null), 2800);
          }}
          onVideoFailed={() => {
            setVideoToast('Set saved. This phone could not store the video.');
            window.setTimeout(() => setVideoToast(null), 3200);
          }}
        />
      ) : null}

      {active && activeLift ? (
        <SetLogger
          exerciseName={activeLift.name}
          setLabel={setDisplayLabel(activeLift.sets, active.setIndex)}
          setCount={
            (activeLift.sets[active.setIndex]?.warmup
              ? activeLift.sets.filter((s) => s.warmup).length
              : activeLift.sets.filter((s) => !s.warmup).length) ?? 0
          }
          initial={activeLift.sets[active.setIndex]}
          lastPerformance={lastByExercise.get(activeLift.exercise_id) ?? null}
          hasLaterSameKind={laterSameKindUnlogged(activeLift.sets, active.setIndex)}
          timed={isTimedHold(activeLift.exercise_id)}
          assisted={isAssistedLoad(activeLift.exercise_id)}
          equipmentOptions={activeEquipOptions}
          equipment={liftEquipment(activeLift)}
          onEquipment={(eq) => {
            if (!activeSlot) return;
            const nextId = exerciseForEquipment(activeSlot, eq, activeLift.exercise_id);
            if (nextId && nextId !== activeLift.exercise_id) {
              onChange(swapLiftExercise(draft, active.liftIndex, nextId));
            }
          }}
          barKg={activeLift.bar_kg ?? loadPreferredBarKg()}
          onBarKg={(kg) => onChange(setLiftBarKg(draft, active.liftIndex, kg))}
          onCancel={() => setActive(null)}
          onComplete={(logged, applyRemaining) =>
            completeSet(active.liftIndex, active.setIndex, logged, applyRemaining)
          }
        />
      ) : null}

      {videoToast ? (
        <p className="vbt-toast" role="status">
          {videoToast}
        </p>
      ) : null}

      {rest ? (
        <RestTimer seconds={rest.seconds} exerciseName={rest.name} onDone={() => setRest(null)} />
      ) : null}
    </main>
  );
}

function ManualExerciseForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: ManualExerciseInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [setCount, setSetCount] = useState(3);
  const [reps, setReps] = useState(10);
  const [bodyweight, setBodyweight] = useState(true);
  const [weightKg, setWeightKg] = useState(5);
  const [eachSide, setEachSide] = useState(false);
  return (
    <section className="card add-exercise" data-testid="add-exercise-form">
      <p className="kicker">Extra exercise</p>
      <h2>Add to today</h2>
      <label className="add-exercise-name">
        Name
        <input
          className="pain-note-input"
          data-testid="exercise-name"
          value={name}
          placeholder="Dead bug, face pull, rehab"
          maxLength={48}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <NumberStepper label="Sets" value={setCount} onChange={setSetCount} step={1} min={1} max={8} suffix="" />
      <NumberStepper label="Reps" value={reps} onChange={setReps} step={1} min={1} max={50} suffix="" />
      <div className="alt-row" role="group" aria-label="Load">
        <button
          type="button"
          className={`chip ${bodyweight ? 'selected' : ''}`}
          onClick={() => setBodyweight(true)}
        >
          Bodyweight
        </button>
        <button
          type="button"
          className={`chip ${bodyweight ? '' : 'selected'}`}
          onClick={() => setBodyweight(false)}
        >
          Weight
        </button>
      </div>
      {bodyweight ? null : (
        <NumberStepper label="Weight" value={weightKg} onChange={setWeightKg} step={2.5} min={0} max={200} suffix="kg" />
      )}
      <button
        type="button"
        className={`chip ${eachSide ? 'selected' : ''}`}
        data-testid="each-side"
        onClick={() => setEachSide((value) => !value)}
      >
        Each side
      </button>
      <div className="set-edit-row">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="confirm-exercise"
          onClick={() =>
            onAdd({
              name,
              setCount,
              reps,
              bodyweight,
              weightKg,
              eachSide,
            })
          }
        >
          Add to today
        </button>
      </div>
    </section>
  );
}

function vbtKindFor(exerciseId: string): VbtLiftKind | null {
  if (exerciseId === 'squat_low_bar') return 'squat';
  if (exerciseId === 'bench_regular') return 'bench';
  if (exerciseId === 'deadlift_conventional') return 'deadlift';
  return null;
}

function slotForLift(template: DayTemplate, lift: LoggedLift, index: number) {
  if (lift.slot_id) {
    const match = template.slots.find((slot) => slot.slot_id === lift.slot_id);
    if (match) return match;
  }
  return (
    template.slots[index] ??
    template.slots.find(
      (slot) => slot.exercise_id === lift.exercise_id || slot.alternatives.includes(lift.exercise_id),
    )
  );
}
