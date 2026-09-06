import type { LoggedSet, SessionDraft } from '../types/session';
import { isWarmupSet } from './sets';

function clampWeightKg(weightKg: number): number {
  if (!Number.isFinite(weightKg)) return 0;
  return Math.min(500, Math.max(0, Math.round(weightKg * 100) / 100));
}

/**
 * Mid-session prescribed-weight edit. Writes onto the draft so Linda does not
 * restart the session or stay locked to the seed template.
 *
 * - Always updates `setIndex`.
 * - When `applyToRemaining` is true, copies the same kg onto later **unlogged**
 *   sets of the **same kind** (warmup→warmup, work→work). Completed sets stay.
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
        if (si === setIndex) return { ...set, weight_kg: nextKg };
        if (
          applyToRemaining &&
          si > setIndex &&
          !set.completed &&
          isWarmupSet(set) === sourceWarmup
        ) {
          return { ...set, weight_kg: nextKg };
        }
        return set;
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
    return {
      ...lift,
      sets: lift.sets.map((set) =>
        set.completed || isWarmupSet(set) ? set : { ...set, weight_kg: nextKg },
      ),
    };
  });
  return { ...draft, lifts, updated_at: new Date().toISOString() };
}

export function logSetOnDraft(
  draft: SessionDraft,
  liftIndex: number,
  setIndex: number,
  logged: LoggedSet,
  applyWeightToRemaining = true,
): SessionDraft {
  const withLog = {
    ...draft,
    lifts: draft.lifts.map((lift, li) => {
      if (li !== liftIndex) return lift;
      return {
        ...lift,
        sets: lift.sets.map((set, si) =>
          si === setIndex ? { ...logged, warmup: set.warmup } : set,
        ),
      };
    }),
    updated_at: new Date().toISOString(),
  };
  if (!applyWeightToRemaining) return withLog;
  return overrideSetWeight(withLog, liftIndex, setIndex, logged.weight_kg, true);
}
