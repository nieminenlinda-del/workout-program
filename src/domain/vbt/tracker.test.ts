import { describe, expect, it } from 'vitest';
import {
  acquirePlate,
  analysisSize,
  containRect,
  diagnosticsLine,
  findPlateCircle,
  paintDisc,
  plateDiameterFraction,
  stampDisc,
  type LumaFrame,
} from './tracker';

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

describe('phone distance', () => {
  it('expects a 45 cm plate at 3 m to be 10–20% of the frame width', () => {
    const fraction = plateDiameterFraction(3);
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.2);
    expect(plateDiameterFraction(1)).toBeGreaterThan(0.3);
    expect(plateDiameterFraction(4)).toBeLessThan(plateDiameterFraction(3));
  });

  it('keeps portrait and landscape track shapes instead of the CSS box', () => {
    const portrait = analysisSize(1080, 1920);
    const landscape = analysisSize(1920, 1080);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(portrait.width / portrait.height).toBeCloseTo(1080 / 1920, 2);
    expect(landscape.width / landscape.height).toBeCloseTo(1920 / 1080, 2);
    const fitted = containRect(1920, 1080, 390, 520);
    expect(fitted.width / fitted.height).toBeCloseTo(1920 / 1080, 2);
    expect(fitted.width).toBeLessThanOrEqual(390);
    expect(fitted.height).toBeLessThanOrEqual(520);
  });

  it('locks a plate at 1–3 m in portrait and landscape even when the wall is bright', () => {
    const tracks = [
      { width: 1080, height: 1920 },
      { width: 1920, height: 1080 },
    ];
    for (const track of tracks) {
      for (const distance of [1, 1.5, 2, 3]) {
        const size = analysisSize(track.width, track.height);
        const frame = homeGym(size.width, size.height, distance);
        expect(longestBrightRun(frame) / frame.width).toBeGreaterThan(0.45);
        const found = acquirePlate(frame);
        expect(found.guidance, `${track.width}x${track.height} at ${distance} m`).toBe('locked');
        const expectedR = (plateDiameterFraction(distance) * frame.width) / 2;
        expect(found.circle?.r).toBeGreaterThan(expectedR * 0.55);
        expect(found.circle?.r).toBeLessThan(expectedR * 1.6);
        expect(found.circle?.cx).toBeGreaterThan(frame.width * 0.45);
        if (distance <= 1) expect(found.close).toBe(true);
        if (distance >= 3) expect(found.close).toBe(false);
      }
    }
  });
});

describe('dark plate', () => {
  it('locks a black plate at close range and still ignores a rack hole', () => {
    const frame: LumaFrame = { width: 160, height: 220, data: new Uint8ClampedArray(160 * 220) };
    frame.data.fill(78);
    stampDisc(frame, 28, 40, 4, 220);
    stampDisc(frame, 100, 120, 28, 32);
    const found = acquirePlate(frame);
    expect(found.guidance).toBe('locked');
    expect(found.circle?.cx).toBeGreaterThan(80);
    expect(found.circle?.r).toBeGreaterThan(18);
    expect(found.circle?.r).toBeLessThan(40);
  });
});

describe('diagnostics line', () => {
  it('reports plate width, track shape, and confidence', () => {
    const line = diagnosticsLine({
      diameterPx: 140,
      frameWidth: 1080,
      trackWidth: 1080,
      trackHeight: 1920,
      confidence: 0.82,
    });
    expect(line).toContain('13%');
    expect(line).toContain('1080×1920 portrait');
    expect(line).toContain('0.82');
  });
});

function homeGym(width: number, height: number, distanceM: number): LumaFrame {
  const frame: LumaFrame = { width, height, data: new Uint8ClampedArray(width * height) };
  frame.data.fill(26);
  const wall = Math.round(height * 0.2);
  for (let y = 0; y < wall; y += 1) {
    for (let x = 0; x < width; x += 1) frame.data[y * width + x] = 190;
  }
  stampDisc(frame, Math.round(width * 0.18), Math.round(height * 0.55), 3, 220);
  stampDisc(frame, Math.round(width * 0.18), Math.round(height * 0.7), 4, 210);
  const diameter = plateDiameterFraction(distanceM) * width;
  stampDisc(frame, Math.round(width * 0.62), Math.round(height * 0.72), diameter / 2, 235);
  return frame;
}

function longestBrightRun(frame: LumaFrame): number {
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
