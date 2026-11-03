import { describe, expect, it } from 'vitest';
import { detectReps, ramp, type VbtSample } from './reps';
import {
  DEFAULT_VELOCITY_LOSS_PCT,
  estimateLoadAtVelocity,
  firstRepPastThreshold,
  summarizeSet,
  velocityLoss,
} from './velocity';

function squatRep(startMs: number, concentricMs: number, rom = 0.6): VbtSample[] {
  const bottom = 0.4;
  const top = bottom + rom;
  const eccentric = Math.round(concentricMs * 1.4);
  return [
    ...ramp(startMs, startMs + eccentric, top, bottom),
    ...ramp(startMs + eccentric, startMs + eccentric + concentricMs, bottom, top),
    ...ramp(startMs + eccentric + concentricMs, startMs + eccentric + concentricMs + 200, top, top),
  ];
}

function deadliftRep(startMs: number, concentricMs: number, rom = 0.5): VbtSample[] {
  const floor = 0.2;
  const lockout = floor + rom;
  return [
    ...ramp(startMs, startMs + concentricMs, floor, lockout),
    ...ramp(startMs + concentricMs, startMs + concentricMs + 400, lockout, lockout),
    ...ramp(startMs + concentricMs + 400, startMs + concentricMs + 1200, lockout, floor),
    ...ramp(startMs + concentricMs + 1200, startMs + concentricMs + 1400, floor, floor),
  ];
}

describe('rep detection', () => {
  it('counts five squat concentrics and ignores the descent', () => {
    let cursor = 0;
    const samples: VbtSample[] = [];
    for (let rep = 0; rep < 5; rep += 1) {
      const piece = squatRep(cursor, 1000);
      samples.push(...piece);
      cursor = (piece[piece.length - 1]?.t_ms ?? cursor) + 33;
    }
    const reps = detectReps(samples, { kind: 'squat' });
    expect(reps).toHaveLength(5);
    for (const rep of reps) {
      expect(rep.rom_m).toBeGreaterThan(0.5);
      expect(rep.rom_m).toBeLessThan(0.7);
      expect(rep.mean_velocity_m_s).toBeGreaterThan(0.5);
      expect(rep.mean_velocity_m_s).toBeLessThan(0.75);
      expect(rep.peak_velocity_m_s).toBeGreaterThanOrEqual(rep.mean_velocity_m_s - 0.05);
      expect(rep.concentric_ms).toBeGreaterThan(800);
      expect(rep.concentric_ms).toBeLessThan(1200);
    }
  });

  it('counts bench reps with a shorter range', () => {
    const samples = [
      ...ramp(0, 800, 0.5, 0.25),
      ...ramp(800, 1600, 0.25, 0.5),
      ...ramp(1600, 2400, 0.5, 0.25),
      ...ramp(2400, 3200, 0.25, 0.5),
    ];
    expect(detectReps(samples, { kind: 'bench' })).toHaveLength(2);
    expect(detectReps(samples, { kind: 'squat' })).toHaveLength(0);
  });

  it('counts deadlift pulls and skips the return to the floor', () => {
    let cursor = 0;
    const samples: VbtSample[] = [];
    for (let rep = 0; rep < 3; rep += 1) {
      const piece = deadliftRep(cursor, 900);
      samples.push(...piece);
      cursor = (piece[piece.length - 1]?.t_ms ?? cursor) + 33;
    }
    const reps = detectReps(samples, { kind: 'deadlift' });
    expect(reps).toHaveLength(3);
    expect(reps[0]?.mean_velocity_m_s).toBeGreaterThan(0.45);
    expect(reps[0]?.mean_velocity_m_s).toBeLessThan(0.7);
  });
});

describe('velocity loss', () => {
  it('compares the last rep with the fastest rep', () => {
    const loss = velocityLoss([0.8, 0.74, 0.62]);
    expect(loss?.best_m_s).toBeCloseTo(0.8);
    expect(loss?.last_m_s).toBeCloseTo(0.62);
    expect(loss?.loss_pct).toBeCloseTo(22.5);
    expect(firstRepPastThreshold([0.8, 0.74, 0.62], DEFAULT_VELOCITY_LOSS_PCT)).toBe(3);
    expect(firstRepPastThreshold([0.8, 0.74, 0.62], 30)).toBeNull();
  });

  it('flags a slowing squat set at the default 20 percent cutoff', () => {
    const durations = [800, 900, 1100];
    let cursor = 0;
    const samples: VbtSample[] = [];
    for (const concentric of durations) {
      const piece = squatRep(cursor, concentric);
      samples.push(...piece);
      cursor = (piece[piece.length - 1]?.t_ms ?? cursor) + 33;
    }
    const summary = summarizeSet(detectReps(samples, { kind: 'squat' }), DEFAULT_VELOCITY_LOSS_PCT);
    expect(summary.rep_count).toBe(3);
    expect(summary.best_velocity_m_s).toBeGreaterThan(summary.last_velocity_m_s);
    expect(summary.velocity_loss_pct).toBeGreaterThan(20);
    expect(summary.stopped_for_loss).toBe(true);
  });

  it('estimates a load at minimum velocity from two points and labels nothing below two', () => {
    expect(estimateLoadAtVelocity([{ load_kg: 60, mean_velocity_m_s: 0.6 }], 0.3)).toBeNull();
    const estimate = estimateLoadAtVelocity(
      [
        { load_kg: 60, mean_velocity_m_s: 0.6 },
        { load_kg: 80, mean_velocity_m_s: 0.4 },
      ],
      0.3,
    );
    expect(estimate).toBeCloseTo(90, 5);
  });
});
