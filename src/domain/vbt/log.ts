import type { SessionDraft, VbtCameraView, VbtSetLog } from '../../types/session';
import type { CameraView, DetectedRep } from './reps';
import type { VbtSetSummary } from './velocity';

export function toVbtSetLog(
  setIndex: number,
  summary: VbtSetSummary,
  loadKg?: number,
  view: CameraView = 'side',
): VbtSetLog {
  if (view !== 'side') {
    return {
      set_index: setIndex,
      view,
      ...(loadKg && loadKg > 0 ? { load_kg: loadKg } : {}),
      reps: summary.reps.map((rep) => ({ rep: rep.rep })),
      rep_count: summary.rep_count,
      threshold_pct: summary.threshold_pct,
      stopped_for_loss: false,
    };
  }
  return {
    set_index: setIndex,
    view: 'side',
    ...(loadKg && loadKg > 0 ? { load_kg: loadKg } : {}),
    reps: summary.reps.map(toRepLog),
    rep_count: summary.rep_count,
    best_velocity_m_s: round3(summary.best_velocity_m_s),
    velocity_loss_pct: round1(summary.velocity_loss_pct),
    threshold_pct: summary.threshold_pct,
    stopped_for_loss: summary.stopped_for_loss,
  };
}

function toRepLog(rep: DetectedRep) {
  return {
    rep: rep.rep,
    mean_velocity_m_s: round3(rep.mean_velocity_m_s),
    peak_velocity_m_s: round3(rep.peak_velocity_m_s),
    rom_cm: round1(rep.rom_m * 100),
    concentric_ms: Math.round(rep.concentric_ms),
  };
}

/**
 * Writes the camera set onto the lift and fills that set's rep count.
 * Leaves weight, RPE, and training-max flags alone.
 */
export function attachVbtSet(
  draft: SessionDraft,
  liftIndex: number,
  setIndex: number,
  summary: VbtSetSummary,
  loadKg = 0,
  view: VbtCameraView = 'side',
): SessionDraft {
  const logged = toVbtSetLog(setIndex, summary, loadKg, view);
  const lifts = draft.lifts.map((lift, index) => {
    if (index !== liftIndex) return lift;
    const sets = lift.sets.map((set, cursor) => {
      if (cursor !== setIndex) return set;
      return { ...set, reps: summary.rep_count, completed: true };
    });
    const previous = (lift.vbt?.sets ?? []).filter((set) => set.set_index !== setIndex);
    return {
      ...lift,
      sets,
      vbt: {
        threshold_pct: summary.threshold_pct,
        sets: [...previous, logged].sort((a, b) => a.set_index - b.set_index),
      },
    };
  });
  return { ...draft, lifts, updated_at: new Date().toISOString() };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
