import { detectReps, type DetectedRep, type VbtLiftKind, type VbtSample } from './reps';

/** Minimum concentric range. Bench is about 15 cm on the 45 cm plate scale. */
export const MIN_ROM_M: Record<VbtLiftKind, number> = {
  squat: 0.25,
  bench: 0.15,
  deadlift: 0.3,
};

const CONCENTRIC_MS: Record<VbtLiftKind, { min: number; max: number }> = {
  squat: { min: 300, max: 6000 },
  bench: { min: 280, max: 4000 },
  deadlift: { min: 250, max: 5000 },
};

/** Mean concentric speed above this is treated as a tracker jump, not a lift. */
const MAX_MEAN_M_S: Record<VbtLiftKind, number> = {
  squat: 2,
  bench: 1.5,
  deadlift: 2.2,
};

export interface GateSample {
  t_ms: number;
  /** Bar height in metres. Null when the plate is not locked. */
  y_m: number | null;
  /** Locked plate radius in pixels. A jump means the tracker slipped. */
  radius_px: number | null;
  /** 0–1 rim confidence. */
  confidence: number;
  /** 0–1 whole-frame shift. High means the phone moved. */
  scene_shift: number;
  occluded: boolean;
}

export interface GatedSet {
  reps: DetectedRep[];
  /** True when a shake burst paused counting. */
  cameraMoved: boolean;
  /** True when a foreground blob covered the plate. */
  occluded: boolean;
}

const UNRACK_M = 0.08;
const UNRACK_HOLD_MS = 400;
const RERACK_BAND_M = 0.04;
const RERACK_STILL_MS = 800;
const REACQUIRE_MS = 1000;
const SHAKE_SHIFT = 0.35;
const MIN_CONFIDENCE = 0.45;
const RADIUS_JUMP = 0.3;

/**
 * Count reps only after the bar leaves the rack on a steady lock, and stop
 * once it is racked and still. Shake, occlusion, and a slipping radius drop
 * the current segment and require the plate to be acquired again.
 */
export function gateReps(
  samples: readonly GateSample[],
  kind: VbtLiftKind,
  rackY_m?: number,
): GatedSet {
  const rackY = rackY_m ?? samples.find((sample) => sample.y_m != null)?.y_m ?? 0;
  let cameraMoved = false;
  let sawOcclusion = false;
  let phase: 'racked' | 'lifting' | 'paused' = 'racked';
  let awaySince: number | null = null;
  let stillSince: number | null = null;
  let cleanSince: number | null = null;
  let lockRadius: number | null = null;
  let segment: VbtSample[] = [];
  const reps: DetectedRep[] = [];

  const flush = () => {
    if (segment.length > 4) reps.push(...acceptReps(segment, kind, reps.length));
    segment = [];
  };

  for (const sample of samples) {
    const bad =
      sample.occluded ||
      sample.scene_shift >= SHAKE_SHIFT ||
      sample.y_m == null ||
      sample.confidence < MIN_CONFIDENCE ||
      radiusSlipped(lockRadius, sample.radius_px);
    if (sample.occluded) sawOcclusion = true;
    if (sample.scene_shift >= SHAKE_SHIFT) cameraMoved = true;
    if (bad) {
      if (phase === 'lifting') flush();
      phase = 'paused';
      awaySince = null;
      stillSince = null;
      cleanSince = null;
      lockRadius = null;
      continue;
    }
    const y = sample.y_m ?? 0;
    if (sample.radius_px != null) lockRadius = sample.radius_px;
    if (phase === 'paused') {
      if (cleanSince == null) cleanSince = sample.t_ms;
      if (sample.t_ms - cleanSince < REACQUIRE_MS) continue;
      phase = 'racked';
      cleanSince = null;
    }
    const away = Math.abs(y - rackY) >= UNRACK_M;
    if (phase === 'racked') {
      if (!away) {
        awaySince = null;
        continue;
      }
      if (awaySince == null) awaySince = sample.t_ms;
      if (sample.t_ms - awaySince < UNRACK_HOLD_MS) continue;
      phase = 'lifting';
      segment = [];
    }
    if (phase !== 'lifting') continue;
    segment.push({ t_ms: sample.t_ms, y_m: y });
    const nearRack = Math.abs(y - rackY) <= RERACK_BAND_M;
    if (!nearRack) {
      stillSince = null;
      continue;
    }
    if (stillSince == null) stillSince = sample.t_ms;
    if (sample.t_ms - stillSince >= RERACK_STILL_MS) {
      flush();
      phase = 'racked';
      stillSince = null;
      awaySince = null;
    }
  }
  if (phase === 'lifting') flush();
  return { reps, cameraMoved, occluded: sawOcclusion };
}

function radiusSlipped(locked: number | null, next: number | null): boolean {
  if (locked == null || next == null || !(locked > 0)) return false;
  return Math.abs(next - locked) / locked > RADIUS_JUMP;
}

function acceptReps(segment: readonly VbtSample[], kind: VbtLiftKind, already: number): DetectedRep[] {
  const limits = CONCENTRIC_MS[kind];
  const cap = MAX_MEAN_M_S[kind];
  return detectReps(segment, { kind, minRomM: MIN_ROM_M[kind] })
    .filter(
      (rep) =>
        rep.rom_m >= MIN_ROM_M[kind] &&
        rep.concentric_ms >= limits.min &&
        rep.concentric_ms <= limits.max &&
        rep.mean_velocity_m_s <= cap &&
        rep.mean_velocity_m_s > 0,
    )
    .map((rep, index) => ({ ...rep, rep: already + index + 1 }));
}

/** Thin overlay radius. Never a disc that covers most of the frame. */
export function markerRadiusPx(radius: number, frameWidth: number, frameHeight: number): number {
  const limit = Math.min(frameWidth, frameHeight) * 0.2;
  if (!Number.isFinite(radius) || radius <= 0) return 8;
  return Math.min(limit, Math.max(6, radius));
}
