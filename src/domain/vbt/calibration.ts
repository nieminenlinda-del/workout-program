/** Standard powerlifting plate diameter. Scale comes from this circle in the side view. */
export const PLATE_DIAMETER_M = 0.45;

/** Metres per pixel from a plate whose diameter was measured in pixels. */
export function metersPerPixel(plateDiameterPx: number): number | null {
  if (!(plateDiameterPx > 1)) return null;
  return PLATE_DIAMETER_M / plateDiameterPx;
}

/**
 * Screen y grows downward. Bar height grows upward from the calibrated origin.
 * `originY` is the pixel row treated as height zero.
 */
export function barHeightM(
  pixelY: number,
  originY: number,
  plateDiameterPx: number,
): number | null {
  const scale = metersPerPixel(plateDiameterPx);
  if (scale == null) return null;
  return (originY - pixelY) * scale;
}

/** Pixel diameter of a 45 cm plate at a known scale. Inverse of `metersPerPixel`. */
export function plateDiameterPx(metersPerPx: number): number | null {
  if (!(metersPerPx > 0)) return null;
  return PLATE_DIAMETER_M / metersPerPx;
}
