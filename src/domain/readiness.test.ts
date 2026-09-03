import { describe, expect, it } from 'vitest';
import { computeReadinessLight, withComputedLight } from './readiness';

describe('readiness light', () => {
  it('is GREEN when scores are solid', () => {
    expect(
      computeReadinessLight({ sleep: 8, soreness: 3, energy: 7, pain: 1, motivation: 8 }),
    ).toBe('GREEN');
  });

  it('is YELLOW when sleep or energy is low', () => {
    expect(
      computeReadinessLight({ sleep: 3, soreness: 3, energy: 7, pain: 1, motivation: 8 }),
    ).toBe('YELLOW');
  });

  it('is RED when pain or soreness is high', () => {
    expect(
      computeReadinessLight({ sleep: 8, soreness: 3, energy: 7, pain: 8, motivation: 8 }),
    ).toBe('RED');
    expect(
      computeReadinessLight({ sleep: 8, soreness: 9, energy: 7, pain: 2, motivation: 8 }),
    ).toBe('RED');
  });

  it('clamps scores and can be overridden', () => {
    const auto = withComputedLight({ sleep: 0, soreness: 3, energy: 7, pain: 1, motivation: 8 });
    expect(auto.sleep).toBe(1);
    expect(auto.light).toBe('YELLOW');
    const forced = withComputedLight(auto, 'GREEN');
    expect(forced.light).toBe('GREEN');
  });
});
