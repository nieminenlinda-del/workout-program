import type { DetectedRep, VbtLiftKind } from './reps';

/** Default speed-loss cutoff before the set. Still adjustable on the camera screen. */
export const DEFAULT_VELOCITY_LOSS_PCT: Record<VbtLiftKind, number> = {
  squat: 20,
  bench: 20,
  deadlift: 15,
};

export function defaultVelocityLossPct(kind: VbtLiftKind): number {
  return DEFAULT_VELOCITY_LOSS_PCT[kind];
}

/**
 * Minimum velocity for the optional load-velocity estimate.
 * Not a tested max and not a training max. Settings can override these.
 */
export const MIN_VELOCITY_M_S: Record<VbtLiftKind, number> = {
  squat: 0.3,
  bench: 0.17,
  deadlift: 0.25,
};

/** Distinct loads required before an estimate is shown. */
export const VELOCITY_ESTIMATE_MIN_LOADS = 3;

/** Heaviest logged load must reach this fraction of the estimated max. */
export const VELOCITY_ESTIMATE_MIN_FRACTION = 0.7;

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

export type VelocityEstimateResult =
  | { status: 'ready'; load_kg: number; heaviest_kg: number; distinct_loads: number }
  | { status: 'need_more_loads'; distinct_loads: number };

/** One point per load. The fastest mean at that load stands in for the set. */
export function distinctLoadPoints(points: readonly LoadVelocityPoint[]): LoadVelocityPoint[] {
  const byLoad = new Map<number, number>();
  for (const point of points) {
    if (!(point.load_kg > 0) || !(point.mean_velocity_m_s > 0)) continue;
    const key = Math.round(point.load_kg * 10) / 10;
    const current = byLoad.get(key);
    if (current == null || point.mean_velocity_m_s > current) byLoad.set(key, point.mean_velocity_m_s);
  }
  return [...byLoad.entries()]
    .map(([load_kg, mean_velocity_m_s]) => ({ load_kg, mean_velocity_m_s }))
    .sort((a, b) => a.load_kg - b.load_kg);
}

/**
 * Show an estimated max only with 3 or more distinct loads, and only when the
 * heaviest of those loads is at least about 70% of that estimate.
 * Otherwise the caller shows a short “need more loads” hint, or nothing.
 * The number is an estimate. It does not update training maxes.
 */
export function velocityEstimate(
  points: readonly LoadVelocityPoint[],
  minVelocityMps: number,
): VelocityEstimateResult {
  const rows = distinctLoadPoints(points);
  if (rows.length < VELOCITY_ESTIMATE_MIN_LOADS) {
    return { status: 'need_more_loads', distinct_loads: rows.length };
  }
  const estimate = estimateLoadAtVelocity(rows, minVelocityMps);
  const heaviest = rows[rows.length - 1]?.load_kg ?? 0;
  if (estimate == null || heaviest < estimate * VELOCITY_ESTIMATE_MIN_FRACTION) {
    return { status: 'need_more_loads', distinct_loads: rows.length };
  }
  return { status: 'ready', load_kg: estimate, heaviest_kg: heaviest, distinct_loads: rows.length };
}
