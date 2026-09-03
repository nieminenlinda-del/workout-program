export interface CountdownState {
  durationSec: number;
  remainingMs: number;
  running: boolean;
  endsAtMs: number | null;
  finished: boolean;
}

export function startCountdown(durationSec: number, nowMs: number): CountdownState {
  const sec = Math.max(0, durationSec);
  const remainingMs = Math.round(sec * 1000);
  return {
    durationSec: sec,
    remainingMs,
    running: remainingMs > 0,
    endsAtMs: remainingMs > 0 ? nowMs + remainingMs : null,
    finished: remainingMs === 0,
  };
}

/** Recompute remaining from wall-clock `endsAtMs` — safe after lock/background. */
export function syncCountdown(state: CountdownState, nowMs: number): CountdownState {
  if (state.finished) {
    return { ...state, remainingMs: 0, running: false, endsAtMs: null };
  }
  if (!state.running || state.endsAtMs == null) {
    return state;
  }
  const remainingMs = Math.max(0, state.endsAtMs - nowMs);
  if (remainingMs <= 0) {
    return {
      ...state,
      remainingMs: 0,
      running: false,
      endsAtMs: null,
      finished: true,
    };
  }
  return { ...state, remainingMs };
}

export function pauseCountdown(state: CountdownState, nowMs: number): CountdownState {
  const synced = syncCountdown(state, nowMs);
  if (synced.finished || !synced.running) return synced;
  return { ...synced, running: false, endsAtMs: null };
}

export function resumeCountdown(state: CountdownState, nowMs: number): CountdownState {
  const synced = syncCountdown(state, nowMs);
  if (synced.finished || synced.remainingMs <= 0) {
    return { ...synced, finished: true, running: false, endsAtMs: null, remainingMs: 0 };
  }
  if (synced.running) return synced;
  return { ...synced, running: true, endsAtMs: nowMs + synced.remainingMs };
}

export function extendCountdown(
  state: CountdownState,
  extraSec: number,
  nowMs: number,
): CountdownState {
  const extra = Math.max(0, extraSec);
  const synced = syncCountdown(state, nowMs);
  if (extra === 0) return synced;
  if (synced.finished) {
    return startCountdown(extra, nowMs);
  }
  const remainingMs = synced.remainingMs + extra * 1000;
  return {
    ...synced,
    durationSec: synced.durationSec + extra,
    remainingMs,
    finished: false,
    endsAtMs: synced.running ? nowMs + remainingMs : null,
  };
}

export function skipCountdown(state: CountdownState): CountdownState {
  return {
    ...state,
    remainingMs: 0,
    running: false,
    endsAtMs: null,
    finished: true,
  };
}

export function displaySeconds(state: CountdownState): number {
  if (state.finished || state.remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(state.remainingMs / 1000));
}

export function formatClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function progressRatio(state: CountdownState): number {
  const total = state.durationSec * 1000;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, state.remainingMs / total));
}
