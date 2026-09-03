import { describe, expect, it } from 'vitest';
import { displaySeconds } from './countdown';
import {
  DEFAULT_INTERVAL_CONFIG,
  extendInterval,
  pauseInterval,
  resumeInterval,
  skipIntervalPhase,
  startInterval,
  syncInterval,
} from './intervalTimer';

describe('interval timer', () => {
  it('starts on WORK round 1 and uses the config durations', () => {
    const started = startInterval({ rounds: 3, workSec: 10, restSec: 5 }, 0);
    expect(started.phase).toBe('work');
    expect(started.round).toBe(1);
    expect(displaySeconds(started.countdown)).toBe(10);
    expect(started.config).toEqual({ rounds: 3, workSec: 10, restSec: 5 });
  });

  it('progresses work → rest → work and skips rest after the last work', () => {
    const t0 = startInterval({ rounds: 2, workSec: 10, restSec: 5 }, 0);
    const rest = syncInterval(t0, 10_000);
    expect(rest.phase).toBe('rest');
    expect(rest.round).toBe(1);
    expect(rest.justTransitioned).toBe(true);
    expect(displaySeconds(rest.countdown)).toBe(5);

    const work2 = syncInterval(rest, 15_000);
    expect(work2.phase).toBe('work');
    expect(work2.round).toBe(2);

    const done = syncInterval(work2, 25_000);
    expect(done.phase).toBe('done');
    expect(done.round).toBe(2);
    expect(done.justTransitioned).toBe(true);
  });

  it('skips the rest phase when restSec is 0', () => {
    const t0 = startInterval({ rounds: 2, workSec: 10, restSec: 0 }, 0);
    const next = syncInterval(t0, 10_000);
    expect(next.phase).toBe('work');
    expect(next.round).toBe(2);
    const done = syncInterval(next, 20_000);
    expect(done.phase).toBe('done');
  });

  it('skip phase advances immediately; pause freezes remaining', () => {
    const t0 = startInterval({ rounds: 2, workSec: 40, restSec: 20 }, 0);
    const paused = pauseInterval(t0, 8_000);
    expect(paused.countdown.running).toBe(false);
    expect(displaySeconds(paused.countdown)).toBe(32);

    const still = syncInterval(paused, 30_000);
    expect(still.phase).toBe('work');
    expect(displaySeconds(still.countdown)).toBe(32);

    const resumed = resumeInterval(still, 30_000);
    expect(resumed.countdown.running).toBe(true);

    const skipped = skipIntervalPhase(resumed, 30_000);
    expect(skipped.phase).toBe('rest');
    expect(skipped.round).toBe(1);

    const skippedRest = skipIntervalPhase(skipped, 30_000);
    expect(skippedRest.phase).toBe('work');
    expect(skippedRest.round).toBe(2);

    const finished = skipIntervalPhase(skippedRest, 30_000);
    expect(finished.phase).toBe('done');
  });

  it('extend adds time to the current phase', () => {
    const t0 = startInterval(DEFAULT_INTERVAL_CONFIG, 0);
    const plus = extendInterval(t0, 15, 1_000);
    expect(displaySeconds(plus.countdown)).toBe(54);
    expect(plus.phase).toBe('work');
  });
});
