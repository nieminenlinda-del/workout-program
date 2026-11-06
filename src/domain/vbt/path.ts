export interface BarPoint {
  x: number;
  y: number;
}

/**
 * Follow the plate without copying single-frame jitter into the bar path.
 * A real move still shows up; a one-frame spike is pulled most of the way back.
 */
export function followBarPoint(previous: BarPoint | null, next: BarPoint, alpha = 0.45): BarPoint {
  if (!previous) return next;
  const mix = Math.min(1, Math.max(0.05, alpha));
  return {
    x: previous.x + (next.x - previous.x) * mix,
    y: previous.y + (next.y - previous.y) * mix,
  };
}
