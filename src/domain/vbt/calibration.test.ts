import { describe, expect, it } from 'vitest';
import { barHeightM, metersPerPixel, plateDiameterPx, PLATE_DIAMETER_M } from './calibration';

describe('plate calibration', () => {
  it('turns a 90 px plate into 0.5 cm per pixel', () => {
    const scale = metersPerPixel(90);
    expect(scale).toBeCloseTo(PLATE_DIAMETER_M / 90, 8);
    expect(plateDiameterPx(scale ?? 0)).toBeCloseTo(90, 6);
  });

  it('rejects a missing or tiny plate', () => {
    expect(metersPerPixel(0)).toBeNull();
    expect(metersPerPixel(-10)).toBeNull();
    expect(plateDiameterPx(0)).toBeNull();
  });

  it('measures upward bar travel from a screen y that grows downward', () => {
    const diameter = 100;
    const origin = 400;
    const higher = barHeightM(300, origin, diameter);
    const lower = barHeightM(350, origin, diameter);
    expect(higher).toBeCloseTo(0.45, 6);
    expect(lower).toBeCloseTo(0.225, 6);
    expect((higher ?? 0) - (lower ?? 0)).toBeCloseTo(0.225, 6);
  });
});
