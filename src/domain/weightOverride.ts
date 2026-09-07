import type { LoggedSet, SessionDraft } from '../types/session';
import { isWarmupSet } from './sets';
import { withPrescription } from './setPrescription';
import { attachWarmups, warmupKindFor } from './warmupLadder';

function clampWeightKg(weightKg: number): number {
  if (!Number.isFinite(weightKg)) return 0;
  return Math.min(500, Math.max(0, Math.round(weightKg * 100) / 100));
}

function asPrescriptionKg(set: LoggedSet, weightKg: number): LoggedSet {
  const nextKg = clampWeightKg(weightKg);
  const prescribed = withPrescription(set);
  return { ...prescribed, weight_kg: nextKg, target_weight_kg: nextKg };
}

/**
 * Mid-session prescribed-weight edit. Writes onto the draft so Linda does not
 * restart the session or stay locked to the seed template.
 *
 * - Always updates `setIndex` working kg **and** its displayed target.
 * - When `applyToRemaining` is true, copies the same kg onto later **unlogged**
 *   sets of the **same kind** (warmup→warmup, work→work) as a new prescription.
 *   Completed sets stay.
 */
export function overrideSetWeight(
  draft: SessionDraft,
  liftIndex: number,
  setIndex: number,
  weightKg: number,
  applyToRemaining = false,
): SessionDraft {
  const nextKg = clampWeightKg(weightKg);
  const sourceWarmup = isWarmupSet(draft.lifts[liftIndex]?.sets[setIndex]);
  const lifts = draft.lifts.map((lift, li) => {
    if (li !== liftIndex) return lift;
    return {
      ...lift,
      sets: lift.sets.map((set, si) => {
        if (si === setIndex) return asPrescriptionKg(set, nextKg);
        if (
          applyToRemaining &&
          si > setIndex &&
          !set.completed &&
          isWarmupSet(set) === sourceWarmup
        ) {
          return asPrescriptionKg(set, nextKg);
        }
        return set;
      }),
    };
  });
  return { ...draft, lifts, updated_at: new Date().toISOString() };
}

/**
 * Copy logged kg onto later unlogged same-kind sets as the **logger input
 * suggestion only**. Displayed `target_*` prescriptions stay.
 */
export function suggestWeightOnLaterUnlogged(
  draft: SessionDraft,
  liftIndex: number,
  setIndex: number,
  weightKg: number,
): SessionDraft {
  const nextKg = clampWeightKg(weightKg);
  const sourceWarmup = isWarmupSet(draft.lifts[liftIndex]?.sets[setIndex]);
  const lifts = draft.lifts.map((lift, li) => {
    if (li !== liftIndex) return lift;
    return {
      ...lift,
      sets: lift.sets.map((set, si) => {
        if (si <= setIndex || set.completed || isWarmupSet(set) !== sourceWarmup) {
          return set;
        }
        return { ...withPrescription(set), weight_kg: nextKg };
      }),
    };
  });
  return { ...draft, lifts, updated_at: new Date().toISOString() };
}

/** Apply one kg value to every unlogged **work** set. Warmups and logged sets stay. */
export function overrideUnloggedLiftWeight(
  draft: SessionDraft,
  liftIndex: number,
  weightKg: number,
): SessionDraft {
  const nextKg = clampWeightKg(weightKg);
  const lifts = draft.lifts.map((lift, li) => {
    if (li !== liftIndex) return lift;
    const sets = lift.sets.map((set) =>
      set.completed || isWarmupSet(set) ? set : asPrescriptionKg(set, nextKg),
    );
    return {
      ...lift,
      sets: attachWarmups(sets, warmupKindFor(lift.exercise_id)),
    };
  });
  return { ...draft, lifts, updated_at: new Date().toISOString() };
}

export function logSetOnDraft(
  draft: SessionDraft,
  liftIndex: number,
  setIndex: number,
  logged: LoggedSet,
  /** Default this-set-only so leftover planned kg stay visible. Pass true to opt in. */
  applyWeightToRemaining = false,
): SessionDraft {
  const withLog = {
    ...draft,
    lifts: draft.lifts.map((lift, li) => {
      if (li !== liftIndex) return lift;
      return {
        ...lift,
        sets: lift.sets.map((set, si) =>
          si === setIndex
            ? {
                ...logged,
                warmup: set.warmup,
                target_weight_kg: set.target_weight_kg ?? set.weight_kg,
                target_reps: set.target_reps ?? set.reps,
              }
            : set,
        ),
      };
    }),
    updated_at: new Date().toISOString(),
  };
  if (!applyWeightToRemaining) return withLog;
  return suggestWeightOnLaterUnlogged(withLog, liftIndex, setIndex, logged.weight_kg);
}
