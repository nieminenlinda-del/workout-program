import { describe, expect, it } from 'vitest';
import { findPlateCircle, paintDisc, type LumaFrame } from './tracker';

describe('plate tracker', () => {
  it('finds a bright plate on a dark frame', () => {
    const frame: LumaFrame = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64) };
    paintDisc(frame, 34, 28, 10, 210, 20);
    const found = findPlateCircle(frame);
    expect(found).not.toBeNull();
    expect(found?.cx).toBeGreaterThan(30);
    expect(found?.cx).toBeLessThan(38);
    expect(found?.cy).toBeGreaterThan(24);
    expect(found?.cy).toBeLessThan(32);
    expect(found?.r).toBeGreaterThan(7);
    expect(found?.r).toBeLessThan(14);
  });

  it('follows a hinted plate after it moves a few pixels', () => {
    const frame: LumaFrame = { width: 80, height: 48, data: new Uint8ClampedArray(80 * 48) };
    paintDisc(frame, 50, 20, 8, 200, 15);
    const found = findPlateCircle(frame, { cx: 46, cy: 22, r: 8, windowPx: 10 });
    expect(found?.cx).toBeGreaterThan(46);
    expect(found?.cx).toBeLessThan(54);
    expect(found?.cy).toBeGreaterThan(16);
    expect(found?.cy).toBeLessThan(24);
  });
});
