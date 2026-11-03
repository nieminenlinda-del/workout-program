export type VbtLiftKind = 'squat' | 'bench' | 'deadlift';

/** One camera sample. `y_m` increases as the bar moves up. */
export interface VbtSample {
  t_ms: number;
  y_m: number;
}

export interface DetectedRep {
  rep: number;
  start_ms: number;
  end_ms: number;
  mean_velocity_m_s: number;
  peak_velocity_m_s: number;
  rom_m: number;
  concentric_ms: number;
}

export interface RepDetectOptions {
  kind: VbtLiftKind;
  /** Smallest concentric range that counts as a rep, in metres. */
  minRomM?: number;
  /** Travel that confirms a turn, in metres. */
  hysteresisM?: number;
}

const MIN_ROM_M: Record<VbtLiftKind, number> = {
  squat: 0.25,
  bench: 0.15,
  deadlift: 0.3,
};

export function smoothSamples(samples: readonly VbtSample[], window = 5): VbtSample[] {
  if (window <= 1 || samples.length === 0) return samples.slice();
  const half = Math.floor(window / 2);
  return samples.map((sample, index) => {
    let sum = 0;
    let count = 0;
    for (let cursor = index - half; cursor <= index + half; cursor += 1) {
      const row = samples[cursor];
      if (!row) continue;
      sum += row.y_m;
      count += 1;
    }
    return { t_ms: sample.t_ms, y_m: sum / count };
  });
}

interface Turn {
  t_ms: number;
  y_m: number;
  index: number;
  kind: 'top' | 'bottom';
}

/**
 * Concentric reps from a smoothed height trace.
 * Squat and bench count the rise after a bottom. Deadlift counts the pull
 * from the low point to lockout and skips the lowering.
 */
export function detectReps(raw: readonly VbtSample[], options: RepDetectOptions): DetectedRep[] {
  const samples = smoothSamples(
    raw.filter((sample) => Number.isFinite(sample.t_ms) && Number.isFinite(sample.y_m)),
    5,
  );
  if (samples.length < 3) return [];
  const minRom = options.minRomM ?? MIN_ROM_M[options.kind];
  const hysteresis = options.hysteresisM ?? Math.min(0.05, minRom * 0.2);
  const turns = findTurns(samples, hysteresis);
  const reps: DetectedRep[] = [];
  for (let index = 0; index < turns.length - 1; index += 1) {
    const start = turns[index];
    const end = turns[index + 1];
    if (!start || !end || start.kind !== 'bottom' || end.kind !== 'top') continue;
    const rom = end.y_m - start.y_m;
    if (rom < minRom) continue;
    const slice = samples.slice(start.index, end.index + 1);
    const measured = measureConcentric(slice, reps.length + 1);
    if (measured) reps.push(measured);
  }
  return reps;
}

function findTurns(samples: readonly VbtSample[], hysteresis: number): Turn[] {
  const turns: Turn[] = [];
  let direction: 'up' | 'down' = 'down';
  let extremeY = samples[0]?.y_m ?? 0;
  let extremeT = samples[0]?.t_ms ?? 0;
  let extremeIndex = 0;

  const commit = (kind: 'top' | 'bottom') => {
    const previous = turns[turns.length - 1];
    if (previous && previous.kind === kind && Math.abs(previous.y_m - extremeY) < hysteresis) return;
    turns.push({ t_ms: extremeT, y_m: extremeY, index: extremeIndex, kind });
  };

  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!sample) continue;
    if (direction === 'down') {
      if (sample.y_m < extremeY) {
        extremeY = sample.y_m;
        extremeT = sample.t_ms;
        extremeIndex = index;
      } else if (sample.y_m - extremeY >= hysteresis) {
        commit('bottom');
        direction = 'up';
        extremeY = sample.y_m;
        extremeT = sample.t_ms;
        extremeIndex = index;
      }
    } else if (sample.y_m > extremeY) {
      extremeY = sample.y_m;
      extremeT = sample.t_ms;
      extremeIndex = index;
    } else if (extremeY - sample.y_m >= hysteresis) {
      commit('top');
      direction = 'down';
      extremeY = sample.y_m;
      extremeT = sample.t_ms;
      extremeIndex = index;
    }
  }

  if (direction === 'up') commit('top');
  else commit('bottom');
  return turns;
}

function measureConcentric(slice: readonly VbtSample[], rep: number): DetectedRep | null {
  const start = slice[0];
  const end = slice[slice.length - 1];
  if (!start || !end) return null;
  const rom = end.y_m - start.y_m;
  const concentric = end.t_ms - start.t_ms;
  if (!(rom > 0) || !(concentric > 0)) return null;
  let peak = 0;
  for (let index = 1; index < slice.length; index += 1) {
    const prev = slice[index - 1];
    const next = slice[index];
    if (!prev || !next) continue;
    const seconds = (next.t_ms - prev.t_ms) / 1000;
    if (!(seconds > 0)) continue;
    const velocity = (next.y_m - prev.y_m) / seconds;
    if (velocity > peak) peak = velocity;
  }
  return {
    rep,
    start_ms: start.t_ms,
    end_ms: end.t_ms,
    mean_velocity_m_s: rom / (concentric / 1000),
    peak_velocity_m_s: peak,
    rom_m: rom,
    concentric_ms: concentric,
  };
}

/** Straight-line ramp used by tests and the on-screen demo bar. */
export function ramp(startMs: number, endMs: number, startY: number, endY: number, stepMs = 33): VbtSample[] {
  const samples: VbtSample[] = [];
  const span = Math.max(1, endMs - startMs);
  for (let t = startMs; t <= endMs; t += stepMs) {
    const mix = (t - startMs) / span;
    samples.push({ t_ms: t, y_m: startY + (endY - startY) * mix });
  }
  return samples;
}
