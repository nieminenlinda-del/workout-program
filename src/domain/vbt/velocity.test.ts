import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VELOCITY_LOSS_PCT,
  MIN_VELOCITY_M_S,
  defaultVelocityLossPct,
  velocityEstimate,
} from './velocity';

describe('velocity-loss defaults', () => {
  it('uses 20% for squat and bench and 15% for deadlift', () => {
    expect(defaultVelocityLossPct('squat')).toBe(20);
    expect(defaultVelocityLossPct('bench')).toBe(20);
    expect(defaultVelocityLossPct('deadlift')).toBe(15);
    expect(DEFAULT_VELOCITY_LOSS_PCT).toEqual({ squat: 20, bench: 20, deadlift: 15 });
  });

  it('keeps minimum-velocity defaults off the training max', () => {
    expect(MIN_VELOCITY_M_S).toEqual({ squat: 0.3, bench: 0.17, deadlift: 0.25 });
  });
});

describe('velocity estimate gate', () => {
  const light = [
    { load_kg: 40, mean_velocity_m_s: 0.55 },
    { load_kg: 50, mean_velocity_m_s: 0.5 },
    { load_kg: 60, mean_velocity_m_s: 0.45 },
  ];

  it('asks for more loads until three distinct loads exist', () => {
    expect(velocityEstimate(light.slice(0, 2), 0.3)).toEqual({
      status: 'need_more_loads',
      distinct_loads: 2,
    });
    expect(velocityEstimate([{ load_kg: 40, mean_velocity_m_s: 0.7 }, { load_kg: 40, mean_velocity_m_s: 0.6 }], 0.3)).toEqual({
      status: 'need_more_loads',
      distinct_loads: 1,
    });
  });

  it('hides the estimate when the heaviest load is under about 70% of the max', () => {
    const gated = velocityEstimate(light, 0.3);
    expect(gated.status).toBe('need_more_loads');
    if (gated.status === 'need_more_loads') expect(gated.distinct_loads).toBe(3);
  });

  it('shows the estimate once the top load is heavy enough', () => {
    const points = [
      { load_kg: 60, mean_velocity_m_s: 0.7 },
      { load_kg: 80, mean_velocity_m_s: 0.5 },
      { load_kg: 100, mean_velocity_m_s: 0.3 },
    ];
    const gated = velocityEstimate(points, 0.2);
    expect(gated.status).toBe('ready');
    if (gated.status === 'ready') {
      expect(gated.load_kg).toBeCloseTo(110, 5);
      expect(gated.heaviest_kg).toBe(100);
    }
  });
});
