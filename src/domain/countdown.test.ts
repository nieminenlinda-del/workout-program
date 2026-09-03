import { describe, expect, it } from 'vitest';
import {
  displaySeconds,
  extendCountdown,
  formatClock,
  pauseCountdown,
  progressRatio,
  resumeCountdown,
  skipCountdown,
  startCountdown,
  syncCountdown,
} from './countdown';

describe('countdown', () => {
  it('counts down from wall-clock endsAt, not tick count', () => {
    const started = startCountdown(90, 1_000);
    expect(started.running).toBe(true);
    expect(started.endsAtMs).toBe(91_000);
    expect(displaySeconds(started)).toBe(90);

    const after10 = syncCountdown(started, 11_000);
    expect(displaySeconds(after10)).toBe(80);
    expect(after10.finished).toBe(false);

    const afterJump = syncCountdown(started, 91_000);
    expect(afterJump.finished).toBe(true);
    expect(displaySeconds(afterJump)).toBe(0);
  });

  it('pauses and does not consume time until resume', () => {
    const started = startCountdown(60, 0);
    const paused = pauseCountdown(started, 10_000);
    expect(paused.running).toBe(false);
    expect(displaySeconds(paused)).toBe(50);

    const stillPaused = syncCountdown(paused, 40_000);
    expect(displaySeconds(stillPaused)).toBe(50);

    const resumed = resumeCountdown(stillPaused, 40_000);
    expect(resumed.running).toBe(true);
    expect(resumed.endsAtMs).toBe(90_000);

    const later = syncCountdown(resumed, 50_000);
    expect(displaySeconds(later)).toBe(40);
  });

  it('extends a running timer and a finished timer', () => {
    const started = startCountdown(30, 0);
    const plus15 = extendCountdown(started, 15, 5_000);
    expect(displaySeconds(plus15)).toBe(40);
    expect(plus15.durationSec).toBe(45);

    const plus30 = extendCountdown(plus15, 30, 5_000);
    expect(displaySeconds(plus30)).toBe(70);

    const done = skipCountdown(plus30);
    const revived = extendCountdown(done, 15, 100_000);
    expect(revived.finished).toBe(false);
    expect(displaySeconds(revived)).toBe(15);
  });

  it('skip finishes immediately', () => {
    const skipped = skipCountdown(startCountdown(180, 0));
    expect(skipped.finished).toBe(true);
    expect(skipped.running).toBe(false);
    expect(displaySeconds(skipped)).toBe(0);
    expect(progressRatio(skipped)).toBe(0);
  });

  it('formats mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(180)).toBe('3:00');
  });
});
