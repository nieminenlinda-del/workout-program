import { describe, expect, it } from 'vitest';
import { demoHeightAt, demoTrace } from './demo';
import { gateReps, markerRadiusPx, overlayStatus, type GateSample } from './gate';
import { acquirePlate, stampDisc, type LumaFrame } from './tracker';

function still(start: number, ms: number, y: number, extra: Partial<GateSample> = {}): GateSample[] {
  const rows: GateSample[] = [];
  for (let t = 0; t <= ms; t += 33) {
    rows.push({
      t_ms: start + t,
      y_m: y,
      radius_px: 40,
      confidence: 0.9,
      scene_shift: 0,
      occluded: false,
      ...extra,
    });
  }
  return rows;
}

function ramp(
  start: number,
  ms: number,
  from: number,
  to: number,
  extra: Partial<GateSample> = {},
): GateSample[] {
  const rows: GateSample[] = [];
  for (let t = 0; t <= ms; t += 33) {
    rows.push({
      t_ms: start + t,
      y_m: from + (to - from) * (t / Math.max(1, ms)),
      radius_px: 40,
      confidence: 0.9,
      scene_shift: 0,
      occluded: false,
      ...extra,
    });
  }
  return rows;
}

/** Rack, leave it, then `reps` bench presses, then a still rack. */
function benchSet(reps: number): GateSample[] {
  const rack = 1;
  const chest = 0.72;
  const rows = [...still(0, 600, rack)];
  let cursor = 700;
  rows.push(...ramp(cursor, 500, rack, chest));
  cursor += 500;
  for (let rep = 0; rep < reps; rep += 1) {
    rows.push(...ramp(cursor, 700, chest, rack));
    cursor += 700;
    rows.push(...still(cursor, 150, rack));
    cursor += 180;
    if (rep < reps - 1) {
      rows.push(...ramp(cursor, 800, rack, chest));
      cursor += 800;
    }
  }
  rows.push(...still(cursor, 1000, rack));
  return rows;
}

describe('rep gating', () => {
  it('ignores a shake burst while the bar is racked', () => {
    const rows = [
      ...still(0, 800, 1),
      ...ramp(800, 4000, 1, 1.4, { scene_shift: 0.8 }),
      ...ramp(4800, 4000, 1.4, 0.6, { scene_shift: 0.8 }),
      ...still(9000, 800, 1),
    ];
    const gated = gateReps(rows, 'bench', 1);
    expect(gated.reps).toHaveLength(0);
    expect(gated.cameraMoved).toBe(true);
  });

  it('ignores a walk-past that occludes the plate', () => {
    const rows = [
      ...still(0, 800, 1),
      ...ramp(800, 2000, 1, 0.2, { occluded: true, confidence: 0.1 }),
      ...ramp(2800, 2000, 0.2, 1.3, { occluded: true, confidence: 0.1 }),
      ...still(5000, 800, 1),
    ];
    const gated = gateReps(rows, 'bench', 1);
    expect(gated.reps).toHaveLength(0);
    expect(gated.occluded).toBe(true);
  });

  it('counts 3 clean bench reps and ignores the rack', () => {
    expect(gateReps(benchSet(3), 'bench', 1).reps).toHaveLength(3);
  });

  it('counts 6 clean bench reps', () => {
    expect(gateReps(benchSet(6), 'bench', 1).reps).toHaveLength(6);
  });

  it('counts the demo bar after it leaves the rack', () => {
    const trace = demoTrace('bench');
    const rack = trace[0]?.y_m ?? 1;
    const rows: GateSample[] = trace.map((sample) => ({
      t_ms: sample.t_ms,
      y_m: demoHeightAt(trace, sample.t_ms),
      radius_px: 48,
      confidence: 0.95,
      scene_shift: 0,
      occluded: false,
    }));
    expect(gateReps(rows, 'bench', rack).reps.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects a rep whose tracked radius jumps', () => {
    const rows = benchSet(3).map((sample, index) =>
      index > 40 && index < 70 ? { ...sample, radius_px: 90 } : sample,
    );
    expect(gateReps(rows, 'bench', 1).reps.length).toBeLessThan(3);
  });
});

describe('plate acquisition', () => {
  it('prefers the 45 cm plate over rack holes and a wall vent', () => {
    const frame: LumaFrame = { width: 200, height: 120, data: new Uint8ClampedArray(200 * 120) };
    frame.data.fill(30);
    stampDisc(frame, 30, 40, 4, 220);
    stampDisc(frame, 30, 70, 3, 200);
    stampDisc(frame, 170, 30, 5, 210);
    stampDisc(frame, 120, 60, 16, 200);
    const found = acquirePlate(frame);
    expect(found.guidance).toBe('locked');
    expect(found.circle?.cx).toBeGreaterThan(100);
    expect(found.circle?.r).toBeGreaterThan(10);
  });

  it('does not lock onto rack holes alone', () => {
    const frame: LumaFrame = { width: 200, height: 120, data: new Uint8ClampedArray(200 * 120) };
    frame.data.fill(25);
    stampDisc(frame, 40, 40, 4, 230);
    stampDisc(frame, 40, 80, 3, 210);
    expect(acquirePlate(frame).circle).toBeNull();
    expect(acquirePlate(frame).guidance).toBe('searching');
  });

  it('keeps a cropped close plate and does not refuse it', () => {
    const frame: LumaFrame = { width: 120, height: 80, data: new Uint8ClampedArray(120 * 80) };
    frame.data.fill(20);
    stampDisc(frame, 108, 40, 36, 220);
    const found = acquirePlate(frame);
    expect(found.guidance).toBe('locked');
    expect(found.circle).not.toBeNull();
    expect(found.close).toBe(true);
    expect(found.circle?.r).toBeGreaterThan(20);
  });
});

describe('marker size', () => {
  it('draws a 1 m plate at its real size and still caps a runaway radius', () => {
    const close = markerRadiusPx(80, 390, 520);
    expect(close).toBe(80);
    const radius = markerRadiusPx(400, 390, 520);
    expect(radius).toBeLessThanOrEqual(390 * 0.48);
    expect(radius).toBeGreaterThan(80);
  });
});

describe('setup check', () => {
  it('waits a second of steady lock before saying the plate is found', () => {
    expect(
      overlayStatus({ guidance: 'locked', steadyMs: 400, cameraMoved: false, barMoving: false }),
    ).toBe('waiting for plate');
    expect(
      overlayStatus({ guidance: 'searching', steadyMs: 2000, cameraMoved: false, barMoving: false }),
    ).toBe('waiting for plate');
    expect(
      overlayStatus({ guidance: 'locked', steadyMs: 1000, cameraMoved: false, barMoving: false }),
    ).toBe('Plate found');
    expect(
      overlayStatus({ guidance: 'locked', steadyMs: 1400, cameraMoved: false, barMoving: true }),
    ).toBe('tracking');
  });

  it('names a camera move and still tracks when the plate is close', () => {
    expect(
      overlayStatus({ guidance: 'locked', steadyMs: 2000, cameraMoved: true, barMoving: true }),
    ).toBe('camera moved');
    expect(
      overlayStatus({ guidance: 'locked', steadyMs: 1200, cameraMoved: false, barMoving: true }),
    ).toBe('tracking');
    expect(
      overlayStatus({ guidance: 'searching', steadyMs: 0, cameraMoved: false, barMoving: false, tapPrompt: true }),
    ).toBe('Tap the plate');
  });
});

describe('deadlift from the floor', () => {
  it('counts lift-off from a still floor with no rack', () => {
    expect(gateReps(deadliftSet(1), 'deadlift').reps).toHaveLength(1);
    expect(gateReps(deadliftSet(3), 'deadlift').reps).toHaveLength(3);
  });
});

function deadliftSet(reps: number): GateSample[] {
  const floor = 0.2;
  const lockout = 0.7;
  const rows = [...still(0, 700, floor)];
  let cursor = 800;
  for (let rep = 0; rep < reps; rep += 1) {
    rows.push(...ramp(cursor, 900, floor, lockout));
    cursor += 900;
    rows.push(...ramp(cursor, 800, lockout, floor));
    cursor += 800;
    rows.push(...still(cursor, 1000, floor));
    cursor += 1100;
  }
  return rows;
}
