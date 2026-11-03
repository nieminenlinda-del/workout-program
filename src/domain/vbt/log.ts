import type { SessionDraft, VbtCameraView, VbtSetLog } from '../../types/session';
import type { RepCorrection } from './correction';
import type { CameraView, DetectedRep } from './reps';
import type { VbtSetSummary } from './velocity';

export function toVbtSetLog(
  setIndex: number,
  summary: VbtSetSummary,
  loadKg?: number,
  view: CameraView = 'side',
  correction?: RepCorrection,
): VbtSetLog {
  const cameraCount = correction?.detected.length ?? summary.reps.length;
  const finalCount = correction?.repCount ?? summary.rep_count;
  const excluded = correction?.excluded ?? [];
  const kept = correction ? summary.reps : summary.reps;
  if (view !== 'side') {
    return {
      set_index: setIndex,
      view,
      ...(loadKg && loadKg > 0 ? { load_kg: loadKg } : {}),
      reps: Array.from({ length: finalCount }, (_, index) => ({ rep: index + 1 })),
      rep_count: finalCount,
      camera_rep_count: cameraCount,
      ...(excluded.length > 0 ? { excluded_reps: excluded } : {}),
      threshold_pct: summary.threshold_pct,
      stopped_for_loss: false,
    };
  }
  return {
    set_index: setIndex,
    view: 'side',
    ...(loadKg && loadKg > 0 ? { load_kg: loadKg } : {}),
    reps: kept.map(toRepLog),
    rep_count: finalCount,
    camera_rep_count: cameraCount,
    ...(excluded.length > 0 ? { excluded_reps: excluded } : {}),
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
  correction?: RepCorrection,
): SessionDraft {
  const logged = toVbtSetLog(setIndex, summary, loadKg, view, correction);
  const finalCount = correction?.repCount ?? summary.rep_count;
  const lifts = draft.lifts.map((lift, index) => {
    if (index !== liftIndex) return lift;
    const sets = lift.sets.map((set, cursor) => {
      if (cursor !== setIndex) return set;
      return { ...set, reps: finalCount, completed: true };
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
