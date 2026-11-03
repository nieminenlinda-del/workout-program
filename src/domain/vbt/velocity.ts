import type { DetectedRep, VbtLiftKind } from './reps';

/** Default strength cutoff. Configurable per lift in the camera screen. */
export const DEFAULT_VELOCITY_LOSS_PCT = 20;

/**
 * Minimum velocity used only for the optional load-velocity estimate.
 * Not a tested max and not a training max.
 */
export const MIN_VELOCITY_M_S: Record<VbtLiftKind, number> = {
  squat: 0.3,
  bench: 0.17,
  deadlift: 0.15,
};

export interface VelocityLoss {
  /** Fastest mean concentric velocity in the set, metres per second. */
  best_m_s: number;
  last_m_s: number;
  /** (best − last) / best, as a percent. Zero when the last rep is the fastest. */
  loss_pct: number;
}

/**
 * Loss versus the fastest rep in the set (the first rep when it is also the
 * fastest, which is the usual straight set).
 */
export function velocityLoss(meanVelocities: readonly number[]): VelocityLoss | null {
  const means = meanVelocities.filter((value) => Number.isFinite(value) && value >= 0);
  if (means.length === 0) return null;
  const best = Math.max(...means);
  const last = means[means.length - 1] ?? best;
  if (!(best > 0)) return { best_m_s: 0, last_m_s: last, loss_pct: 0 };
  return {
    best_m_s: best,
    last_m_s: last,
    loss_pct: ((best - last) / best) * 100,
  };
}

/** First rep (1-based) whose loss versus the best so far crosses the cutoff. */
export function firstRepPastThreshold(
  meanVelocities: readonly number[],
  thresholdPct: number,
): number | null {
  let best = 0;
  for (let index = 0; index < meanVelocities.length; index += 1) {
    const mean = meanVelocities[index] ?? 0;
    if (mean > best) best = mean;
    if (index === 0 || !(best > 0)) continue;
    const loss = ((best - mean) / best) * 100;
    if (loss >= thresholdPct) return index + 1;
  }
  return null;
}

export interface VbtSetSummary {
  reps: DetectedRep[];
  rep_count: number;
  best_velocity_m_s: number;
  last_velocity_m_s: number;
  velocity_loss_pct: number;
  threshold_pct: number;
  stopped_for_loss: boolean;
}

export function summarizeSet(reps: readonly DetectedRep[], thresholdPct: number): VbtSetSummary {
  const means = reps.map((rep) => rep.mean_velocity_m_s);
  const loss = velocityLoss(means);
  const crossed = firstRepPastThreshold(means, thresholdPct);
  return {
    reps: reps.slice(),
    rep_count: reps.length,
    best_velocity_m_s: loss?.best_m_s ?? 0,
    last_velocity_m_s: loss?.last_m_s ?? 0,
    velocity_loss_pct: loss?.loss_pct ?? 0,
    threshold_pct: thresholdPct,
    stopped_for_loss: crossed != null,
  };
}

export interface LoadVelocityPoint {
  load_kg: number;
  mean_velocity_m_s: number;
}

/**
 * Straight-line load-velocity estimate of the load at `minVelocityMps`.
 * Returns null with fewer than two loads or when the line does not fall.
 * This is an estimate, not a training max.
 */
export function estimateLoadAtVelocity(
  points: readonly LoadVelocityPoint[],
  minVelocityMps: number,
): number | null {
  const rows = points.filter(
    (point) => point.load_kg > 0 && Number.isFinite(point.mean_velocity_m_s) && point.mean_velocity_m_s > 0,
  );
  if (rows.length < 2) return null;
  const n = rows.length;
  let sumL = 0;
  let sumV = 0;
  for (const row of rows) {
    sumL += row.load_kg;
    sumV += row.mean_velocity_m_s;
  }
  const meanL = sumL / n;
  const meanV = sumV / n;
  let num = 0;
  let den = 0;
  for (const row of rows) {
    num += (row.load_kg - meanL) * (row.mean_velocity_m_s - meanV);
    den += (row.load_kg - meanL) ** 2;
  }
  if (!(den > 0)) return null;
  const slope = num / den;
  if (!(slope < 0)) return null;
  const intercept = meanV - slope * meanL;
  const load = (minVelocityMps - intercept) / slope;
  if (!(load > 0) || load > 500) return null;
  return load;
}
