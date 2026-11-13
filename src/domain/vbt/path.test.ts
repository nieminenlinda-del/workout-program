import { describe, expect, it } from 'vitest';
import { followBarPoint } from './path';

describe('bar path', () => {
  it('keeps a steady plate still and damps a one-frame spike', () => {
    const still = followBarPoint({ x: 100, y: 200 }, { x: 101, y: 199 });
    expect(still.x).toBeCloseTo(100.45, 2);
    expect(still.y).toBeCloseTo(199.55, 2);

    const spiked = followBarPoint({ x: 100, y: 200 }, { x: 100, y: 260 });
    expect(spiked.y).toBeLessThan(240);
    expect(spiked.y).toBeGreaterThan(200);

    const moved = followBarPoint(spiked, { x: 100, y: 260 });
    expect(moved.y).toBeGreaterThan(spiked.y);
  });
});
