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

/**
 * Side-view plate finder. Scores a circle by the brightness step across its
 * rim. A tap hint keeps the search on a small window so a phone can run it
 * every frame without a model.
 */
export function findPlateCircle(frame: LumaFrame, hint?: PlateSearch): PlateCircle | null {
  if (frame.width < 8 || frame.height < 8) return null;
  const windowPx = hint?.windowPx ?? Math.max(frame.width, frame.height);
  const minR = hint ? Math.max(4, Math.round(hint.r * 0.75)) : 6;
  const maxR = hint
    ? Math.min(Math.round(hint.r * 1.25), Math.floor(Math.min(frame.width, frame.height) / 2) - 1)
    : Math.floor(Math.min(frame.width, frame.height) / 2) - 1;
  if (!(maxR > minR)) return null;
  const x0 = hint ? Math.max(maxR, Math.round(hint.cx - windowPx)) : maxR;
  const x1 = hint ? Math.min(frame.width - maxR - 1, Math.round(hint.cx + windowPx)) : frame.width - maxR - 1;
  const y0 = hint ? Math.max(maxR, Math.round(hint.cy - windowPx)) : maxR;
  const y1 = hint ? Math.min(frame.height - maxR - 1, Math.round(hint.cy + windowPx)) : frame.height - maxR - 1;
  const step = hint ? 1 : Math.max(2, Math.round(Math.min(frame.width, frame.height) / 24));
  let best: PlateCircle | null = null;
  for (let cy = y0; cy <= y1; cy += step) {
    for (let cx = x0; cx <= x1; cx += step) {
      for (let r = minR; r <= maxR; r += hint ? 1 : 2) {
        const score = rimScore(frame, cx, cy, r);
        if (!best || score > best.score) best = { cx, cy, r, score };
      }
    }
  }
  if (!best || best.score < 18) return null;
  return best;
}

function rimScore(frame: LumaFrame, cx: number, cy: number, r: number): number {
  let total = 0;
  let count = 0;
  const samples = 12;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
    const inner = luma(frame, cx + Math.cos(angle) * r * 0.55, cy + Math.sin(angle) * r * 0.55);
    const outer = luma(frame, cx + Math.cos(angle) * r * 1.35, cy + Math.sin(angle) * r * 1.35);
    if (inner == null || outer == null) continue;
    total += Math.abs(inner - outer);
    count += 1;
  }
  return count >= 8 ? total / count : 0;
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
  const r2 = r * r;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) frame.data[y * frame.width + x] = fill;
    }
  }
}
