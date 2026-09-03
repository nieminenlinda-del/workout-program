import {
  extendCountdown,
  pauseCountdown,
  resumeCountdown,
  skipCountdown,
  startCountdown,
  syncCountdown,
  type CountdownState,
} from './countdown';

export type IntervalPhase = 'idle' | 'work' | 'rest' | 'done';

export interface IntervalConfig {
  rounds: number;
  workSec: number;
  restSec: number;
}

export interface IntervalState {
  config: IntervalConfig;
  round: number;
  phase: IntervalPhase;
  countdown: CountdownState;
  /** True when this sync just changed phase — used to fire cues. */
  justTransitioned: boolean;
}

export const DEFAULT_INTERVAL_CONFIG: IntervalConfig = {
  rounds: 8,
  workSec: 40,
  restSec: 20,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function clampIntervalConfig(config: IntervalConfig): IntervalConfig {
  return {
    rounds: clamp(config.rounds, 1, 40),
    workSec: clamp(config.workSec, 5, 600),
    restSec: clamp(config.restSec, 0, 600),
  };
}

export function idleInterval(config: IntervalConfig = DEFAULT_INTERVAL_CONFIG): IntervalState {
  const cfg = clampIntervalConfig(config);
  return {
    config: cfg,
    round: 1,
    phase: 'idle',
    countdown: startCountdown(cfg.workSec, 0),
    justTransitioned: false,
  };
}

export function startInterval(config: IntervalConfig, nowMs: number): IntervalState {
  const cfg = clampIntervalConfig(config);
  return {
    config: cfg,
    round: 1,
    phase: 'work',
    countdown: startCountdown(cfg.workSec, nowMs),
    justTransitioned: true,
  };
}

function advanceFromFinishedPhase(state: IntervalState, nowMs: number): IntervalState {
  if (state.phase === 'work') {
    if (state.round >= state.config.rounds) {
      return {
        ...state,
        phase: 'done',
        countdown: skipCountdown(state.countdown),
        justTransitioned: true,
      };
    }
    if (state.config.restSec <= 0) {
      return {
        ...state,
        round: state.round + 1,
        phase: 'work',
        countdown: startCountdown(state.config.workSec, nowMs),
        justTransitioned: true,
      };
    }
    return {
      ...state,
      phase: 'rest',
      countdown: startCountdown(state.config.restSec, nowMs),
      justTransitioned: true,
    };
  }
  if (state.phase === 'rest') {
    return {
      ...state,
      round: state.round + 1,
      phase: 'work',
      countdown: startCountdown(state.config.workSec, nowMs),
      justTransitioned: true,
    };
  }
  return { ...state, justTransitioned: false };
}

export function syncInterval(state: IntervalState, nowMs: number): IntervalState {
  if (state.phase === 'idle' || state.phase === 'done') {
    return { ...state, justTransitioned: false };
  }
  const countdown = syncCountdown(state.countdown, nowMs);
  if (!countdown.finished) {
    return { ...state, countdown, justTransitioned: false };
  }
  return advanceFromFinishedPhase({ ...state, countdown }, nowMs);
}

export function pauseInterval(state: IntervalState, nowMs: number): IntervalState {
  if (state.phase === 'idle' || state.phase === 'done') return { ...state, justTransitioned: false };
  return {
    ...state,
    countdown: pauseCountdown(state.countdown, nowMs),
    justTransitioned: false,
  };
}

export function resumeInterval(state: IntervalState, nowMs: number): IntervalState {
  if (state.phase === 'idle' || state.phase === 'done') return { ...state, justTransitioned: false };
  return {
    ...state,
    countdown: resumeCountdown(state.countdown, nowMs),
    justTransitioned: false,
  };
}

export function extendInterval(state: IntervalState, extraSec: number, nowMs: number): IntervalState {
  if (state.phase === 'idle' || state.phase === 'done') return { ...state, justTransitioned: false };
  return {
    ...state,
    countdown: extendCountdown(state.countdown, extraSec, nowMs),
    justTransitioned: false,
  };
}

export function skipIntervalPhase(state: IntervalState, nowMs: number): IntervalState {
  if (state.phase === 'idle' || state.phase === 'done') return { ...state, justTransitioned: false };
  return advanceFromFinishedPhase(
    { ...state, countdown: skipCountdown(state.countdown) },
    nowMs,
  );
}

export function stopInterval(config: IntervalConfig): IntervalState {
  return idleInterval(config);
}
