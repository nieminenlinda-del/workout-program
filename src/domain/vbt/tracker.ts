export interface LumaFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PlateCircle {
  cx: number;
  cy: number;
  r: number;
  score: number;
}

export interface PlateSearch {
  cx: number;
  cy: number;
  r: number;
  /** How far the centre may move from the hint, in pixels. */
  windowPx?: number;
  /** Tap-to-lock. Search a wider size band around the seed. */
  wide?: boolean;
}

export type PlateGuidance = 'searching' | 'locked';

export interface PlateAcquisition {
  circle: PlateCircle | null;
  guidance: PlateGuidance;
  /** The plate is large or partly out of frame. Counting still runs. */
  close: boolean;
}

/**
 * Phone wide-camera horizontal field. A 45 cm plate at 3 m covers about
 * 13% of that field — inside the 10–20% band, not "too close".
 */
export const PHONE_HFOV_DEG = 67;

/** Diameter of a 45 cm plate as a fraction of the camera's horizontal field. */
export function plateDiameterFraction(distanceM: number, hfovDeg = PHONE_HFOV_DEG): number {
  if (!(distanceM > 0)) return 1;
  const subtended = 2 * Math.atan(0.225 / distanceM);
  const hfov = (hfovDeg * Math.PI) / 180;
  return subtended / hfov;
}

/**
 * Analysis size for a camera track. Keeps the track's aspect ratio.
 * Portrait 1080×1920 stays taller than it is wide; it is not stretched
 * into the CSS preview box.
 */
export function analysisSize(
  trackWidth: number,
  trackHeight: number,
  maxEdge = 240,
): { width: number; height: number } {
  const edge = Math.max(trackWidth, trackHeight, 1);
  const scale = maxEdge / edge;
  return {
    width: Math.max(16, Math.round(trackWidth * scale)),
    height: Math.max(16, Math.round(trackHeight * scale)),
  };
}

/** Where a video frame sits inside the preview without stretching. */
export function containRect(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(dstWidth / Math.max(1, srcWidth), dstHeight / Math.max(1, srcHeight));
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return { x: (dstWidth - width) / 2, y: (dstHeight - height) / 2, width, height };
}

/**
 * Accepted plate radius. About 4 m is the small end (still bigger than a
 * rack hole). About 1 m, including a plate that runs off the frame, is the
 * large end. There is no hard "too close" cutoff.
 */
export function plateRadiusBounds(frameWidth: number): { minR: number; maxR: number } {
  return {
    minR: Math.max(6, frameWidth * 0.035),
    maxR: Math.max(frameWidth * 0.55, 12),
  };
}

/**
 * Side-view plate finder. Prefers a strong circular rim the size of a 45 cm
 * plate and ignores rack holes, vents, and smaller stored plates. A large or
 * cropped plate is locked from the visible arc; it is never refused.
 */
export function acquirePlate(frame: LumaFrame, hint?: PlateSearch): PlateAcquisition {
  const empty = { circle: null, guidance: 'searching' as const, close: false };
  if (frame.width < 16 || frame.height < 16) return empty;
  const bounds = plateRadiusBounds(frame.width);
  const usableHint = hint
    ? { ...hint, r: Math.min(bounds.maxR, Math.max(bounds.minR, hint.r)) }
    : undefined;
  const locked = searchPlate(frame, usableHint, bounds.minR, bounds.maxR);
  if (!locked) return empty;
  return { circle: locked, guidance: 'locked', close: plateLooksClose(locked, frame) };
}

export function diagnosticsLine(input: {
  diameterPx: number | null;
  frameWidth: number;
  trackWidth: number;
  trackHeight: number;
  confidence: number | null;
}): string {
  const pct =
    input.diameterPx == null || !(input.frameWidth > 0)
      ? '—'
      : `${Math.round((input.diameterPx / input.frameWidth) * 100)}%`;
  const orientation = input.trackWidth >= input.trackHeight ? 'landscape' : 'portrait';
  const confidence = input.confidence == null ? '—' : input.confidence.toFixed(2);
  return `plate ${pct} of width · ${input.trackWidth}×${input.trackHeight} ${orientation} · lock ${confidence}`;
}

/** Soft coaching only. A plate this large still counts. */
export function plateLooksClose(circle: PlateCircle, frame: LumaFrame): boolean {
  const short = Math.min(frame.width, frame.height);
  const diameter = circle.r * 2;
  const cropped =
    circle.cx - circle.r < frame.width * 0.02 ||
    circle.cy - circle.r < frame.height * 0.02 ||
    circle.cx + circle.r > frame.width * 0.98 ||
    circle.cy + circle.r > frame.height * 0.98;
  return diameter >= short * 0.32 || cropped;
}

export function findPlateCircle(frame: LumaFrame, hint?: PlateSearch): PlateCircle | null {
  return acquirePlate(frame, hint).circle;
}

function searchPlate(
  frame: LumaFrame,
  hint: PlateSearch | undefined,
  minR: number,
  maxR: number,
): PlateCircle | null {
  const low = Math.max(4, Math.round(minR));
  const high = Math.round(maxR);
  if (!(high > low)) return null;
  const windowPx = hint?.windowPx ?? Math.max(frame.width, frame.height);
  const margin = 1;
  const x0 = hint ? Math.max(margin, Math.round(hint.cx - windowPx)) : margin;
  const x1 = hint ? Math.min(frame.width - 1 - margin, Math.round(hint.cx + windowPx)) : frame.width - 1 - margin;
  const y0 = hint ? Math.max(margin, Math.round(hint.cy - windowPx)) : margin;
  const y1 = hint ? Math.min(frame.height - 1 - margin, Math.round(hint.cy + windowPx)) : frame.height - 1 - margin;
  if (x1 < x0 || y1 < y0) return null;
  const step = hint ? 1 : Math.max(2, Math.round(Math.min(frame.width, frame.height) / 24));
  const rStep = hint ? 1 : 2;
  let best: PlateCircle | null = null;
  for (let cy = y0; cy <= y1; cy += step) {
    for (let cx = x0; cx <= x1; cx += step) {
      const rStart = hint ? Math.max(low, Math.round(hint.r * (hint.wide ? 0.45 : 0.7))) : low;
      const rEnd = hint ? Math.min(high, Math.round(hint.r * (hint.wide ? 2.2 : 1.35))) : high;
      for (let r = rStart; r <= rEnd; r += rStep) {
        const rim = rimDetail(frame, cx, cy, r);
        if (rim.score < 18 || !plateFace(frame, cx, cy, r, rim)) continue;
        if (!best || rim.score > best.score) best = { cx, cy, r, score: rim.score };
      }
    }
  }
  if (!best || best.score < 18) return null;
  return best;
}

interface RimDetail {
  score: number;
  /** Samples whose edge is actually stronger than noise. */
  strong: number;
  count: number;
}

/** Visible rim arc. A full circle scores higher than the same contrast on a short arc. */
function rimDetail(frame: LumaFrame, cx: number, cy: number, r: number): RimDetail {
  let total = 0;
  let count = 0;
  let strong = 0;
  const samples = 16;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
    const inner = luma(frame, cx + Math.cos(angle) * r * 0.9, cy + Math.sin(angle) * r * 0.9);
    const outer = luma(frame, cx + Math.cos(angle) * r * 1.1, cy + Math.sin(angle) * r * 1.1);
    if (inner == null || outer == null) continue;
    const delta = Math.abs(inner - outer);
    total += delta;
    count += 1;
    if (delta >= 22) strong += 1;
  }
  if (count < 6) return { score: 0, strong: 0, count };
  const completeness = count / samples;
  return { score: (total / count) * (0.55 + 0.45 * completeness), strong, count };
}

/**
 * A light plate is a bright face. A black plate is a uniform face whose rim
 * is strong all the way around, not one bright hole inside a large circle.
 */
function plateFace(frame: LumaFrame, cx: number, cy: number, r: number, rim: RimDetail): boolean {
  const stats = interiorStats(frame, cx, cy, r);
  if (stats.total < 6) return true;
  if (stats.bright / stats.total >= 0.45) return true;
  const consistent = rim.count >= 10 && rim.strong / rim.count >= 0.7;
  return stats.spread <= 28 && consistent;
}

function interiorStats(
  frame: LumaFrame,
  cx: number,
  cy: number,
  r: number,
): { bright: number; total: number; spread: number } {
  let bright = 0;
  let total = 0;
  let min = 255;
  let max = 0;
  for (let index = 0; index < 20; index += 1) {
    const angle = (index / 20) * Math.PI * 2;
    const sample = luma(frame, cx + Math.cos(angle) * r * 0.45, cy + Math.sin(angle) * r * 0.45);
    if (sample == null) continue;
    total += 1;
    if (sample >= 100) bright += 1;
    if (sample < min) min = sample;
    if (sample > max) max = sample;
  }
  return { bright, total, spread: total === 0 ? 0 : max - min };
}

function luma(frame: LumaFrame, x: number, y: number): number | null {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) return null;
  return frame.data[py * frame.width + px] ?? null;
}

/** Draw a disc into a luma buffer. Tests and the demo feed use this. */
export function paintDisc(
  frame: LumaFrame,
  cx: number,
  cy: number,
  r: number,
  fill: number,
  background: number,
): void {
  frame.data.fill(background);
  stampDisc(frame, cx, cy, r, fill);
}

/** Add a disc without clearing the frame. */
export function stampDisc(frame: LumaFrame, cx: number, cy: number, r: number, fill: number): void {
  const r2 = r * r;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) frame.data[y * frame.width + x] = fill;
    }
  }
}
