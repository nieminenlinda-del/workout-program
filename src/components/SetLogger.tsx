import { useState } from 'react';
import type { LoggedSet } from '../types/session';
import { NumberStepper } from './NumberStepper';
import { LastPerformanceHint } from './LastPerformanceHint';
import type { LastPerformance } from '../domain/lastPerformance';
import { formatPlanLoad, prescriptionWeightKg } from '../domain/setPrescription';

const RPE_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export function SetLogger({
  exerciseName,
  setLabel,
  setCount,
  initial,
  lastPerformance,
  hasLaterSameKind,
  onCancel,
  onComplete,
}: {
  exerciseName: string;
  setLabel: string;
  setCount: number;
  initial: LoggedSet;
  lastPerformance?: LastPerformance | null;
  hasLaterSameKind: boolean;
  onCancel: () => void;
  onComplete: (set: LoggedSet, applyWeightToRemaining: boolean) => void;
}) {
  const [weight, setWeight] = useState(initial.weight_kg);
  const [reps, setReps] = useState(initial.reps);
  const [rpe, setRpe] = useState(initial.rpe);
  const [amrap, setAmrap] = useState(Boolean(initial.amrap));
  const [applyRemaining, setApplyRemaining] = useState(false);
  const planKg = prescriptionWeightKg(initial);
  const overridden = weight !== planKg;
  const warmup = Boolean(initial.warmup);

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="sheet"
        role="dialog"
        aria-label="Log set"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <p className="sheet-kicker">
          {warmup ? `Warmup ${setLabel}` : `Set ${setLabel}`} / {setCount}
          {amrap ? ' · AMRAP' : ''}
        </p>
        <h2 className="sheet-title">{exerciseName}</h2>
        <p className="sheet-plan">Plan {formatPlanLoad(initial)}</p>
        <LastPerformanceHint performance={lastPerformance} />

        <NumberStepper
          label={overridden ? 'Weight — overridden' : 'Weight'}
          value={weight}
          onChange={setWeight}
          step={2.5}
          suffix="kg"
          hint="Tap the number to type. Steppers are 2.5 kg. Not locked to the plan."
        />
        <div className="micro-steps">
          <button type="button" className="chip" onClick={() => setWeight((w) => Math.max(0, Math.round((w - 1.25) * 100) / 100))}>
            −1.25
          </button>
          <button type="button" className="chip" onClick={() => setWeight((w) => Math.round((w + 1.25) * 100) / 100)}>
            +1.25
          </button>
        </div>

        <NumberStepper label="Reps" value={reps} onChange={setReps} step={1} min={0} max={50} suffix="reps" />

        <div className="rpe-block">
          <span className="stepper-label">RPE</span>
          <div className="rpe-row" role="listbox" aria-label="RPE">
            {RPE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={rpe === opt}
                className={`rpe-chip ${rpe === opt ? 'selected' : ''}`}
                onClick={() => setRpe(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={`toggle ${amrap ? 'on' : ''}`}
          onClick={() => setAmrap((v) => !v)}
        >
          AMRAP set
        </button>

        {hasLaterSameKind ? (
          <button
            type="button"
            className={`toggle ${applyRemaining ? 'on apply-on' : ''}`}
            onClick={() => setApplyRemaining((v) => !v)}
          >
            {applyRemaining
              ? warmup
                ? 'Start leftover warmups at this kg'
                : 'Start leftover work sets at this kg'
              : 'This set only'}
          </button>
        ) : null}

        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onComplete(
                {
                  weight_kg: weight,
                  reps,
                  rpe,
                  completed: true,
                  amrap,
                  warmup,
                },
                applyRemaining,
              )
            }
          >
            Complete set
          </button>
        </div>
      </div>
    </div>
  );
}
