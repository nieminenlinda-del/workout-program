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
}

export type PlateGuidance = 'searching' | 'locked' | 'move_back';

export interface PlateAcquisition {
  circle: PlateCircle | null;
  guidance: PlateGuidance;
}

/** A 45 cm plate at about 2 m is roughly 10–40% of the frame width. */
export function plateRadiusBounds(frameWidth: number): { minR: number; maxR: number } {
  return {
    minR: Math.max(6, frameWidth * 0.055),
    maxR: frameWidth * 0.2,
  };
}

/**
 * Side-view plate finder. Prefers a large, complete rim and ignores rack
 * holes, vents, and a plate that is cropped by the frame.
 */
export function acquirePlate(frame: LumaFrame, hint?: PlateSearch): PlateAcquisition {
  if (frame.width < 16 || frame.height < 16) return { circle: null, guidance: 'searching' };
  const bounds = plateRadiusBounds(frame.width);
  const usableHint =
    hint && hint.r >= bounds.minR && hint.r <= bounds.maxR ? hint : undefined;
  if (brightSpan(frame) > frame.width * 0.45) return { circle: null, guidance: 'move_back' };
  const locked = searchPlate(frame, usableHint, bounds.minR, bounds.maxR);
  if (locked) return { circle: locked, guidance: 'locked' };
  return { circle: null, guidance: 'searching' };
}

function brightSpan(frame: LumaFrame): number {
  let best = 0;
  for (let y = 0; y < frame.height; y += 2) {
    let run = 0;
    for (let x = 0; x < frame.width; x += 2) {
      if ((frame.data[y * frame.width + x] ?? 0) >= 140) {
        run += 2;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
  }
  return best;
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
  const high = Math.min(Math.round(maxR), Math.floor(Math.min(frame.width, frame.height) / 2) - 1);
  if (!(high > low)) return null;
  const windowPx = hint?.windowPx ?? Math.max(frame.width, frame.height);
  const x0 = hint ? Math.max(high, Math.round(hint.cx - windowPx)) : high;
  const x1 = hint ? Math.min(frame.width - high - 1, Math.round(hint.cx + windowPx)) : frame.width - high - 1;
  const y0 = hint ? Math.max(high, Math.round(hint.cy - windowPx)) : high;
  const y1 = hint ? Math.min(frame.height - high - 1, Math.round(hint.cy + windowPx)) : frame.height - high - 1;
  if (x1 < x0 || y1 < y0) return null;
  const step = hint ? 1 : Math.max(2, Math.round(Math.min(frame.width, frame.height) / 24));
  const rStep = hint ? 1 : 2;
  let best: PlateCircle | null = null;
  for (let cy = y0; cy <= y1; cy += step) {
    for (let cx = x0; cx <= x1; cx += step) {
      for (let r = low; r <= high; r += rStep) {
        const score = rimScore(frame, cx, cy, r);
        if (score < 18 || fillRatio(frame, cx, cy, r) < 0.45) continue;
        if (!best || score > best.score) best = { cx, cy, r, score };
      }
    }
  }
  if (!best || best.score < 18) return null;
  return best;
}

function rimScore(frame: LumaFrame, cx: number, cy: number, r: number, requireFullRim = true): number {
  let total = 0;
  let count = 0;
  const samples = 16;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
    const inner = luma(frame, cx + Math.cos(angle) * r * 0.55, cy + Math.sin(angle) * r * 0.55);
    const outer = luma(frame, cx + Math.cos(angle) * r * 1.2, cy + Math.sin(angle) * r * 1.2);
    if (inner == null || outer == null) continue;
    total += Math.abs(inner - outer);
    count += 1;
  }
  if (requireFullRim && count < 12) return 0;
  if (count < 8) return 0;
  return total / count;
}

function fillRatio(frame: LumaFrame, cx: number, cy: number, r: number): number {
  let bright = 0;
  let total = 0;
  for (let index = 0; index < 20; index += 1) {
    const angle = (index / 20) * Math.PI * 2;
    const sample = luma(frame, cx + Math.cos(angle) * r * 0.5, cy + Math.sin(angle) * r * 0.5);
    if (sample == null) continue;
    total += 1;
    if (sample >= 100) bright += 1;
  }
  return total === 0 ? 0 : bright / total;
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
