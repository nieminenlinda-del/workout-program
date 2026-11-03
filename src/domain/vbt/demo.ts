import { ramp, type VbtLiftKind, type VbtSample } from './reps';

/** Four scripted reps. The last pull is slower so a 20% loss warning can fire. */
export function demoTrace(kind: VbtLiftKind): VbtSample[] {
  const rom = kind === 'bench' ? 0.28 : kind === 'deadlift' ? 0.48 : 0.55;
  const low = 0.35;
  const high = low + rom;
  const concentrics = [700, 820, 980, 1200];
  const samples: VbtSample[] = [];
  let cursor = 0;
  for (const concentric of concentrics) {
    const lower = kind === 'deadlift' ? 0 : Math.round(concentric * 1.3);
    if (lower > 0) samples.push(...ramp(cursor, cursor + lower, high, low));
    cursor += lower;
    samples.push(...ramp(cursor, cursor + concentric, low, high));
    cursor += concentric;
    samples.push(...ramp(cursor, cursor + 180, high, high));
    cursor += 180;
    if (kind === 'deadlift') {
      samples.push(...ramp(cursor, cursor + 700, high, low));
      cursor += 700;
    }
  }
  return samples;
}

export function demoHeightAt(trace: readonly VbtSample[], elapsedMs: number): number {
  if (trace.length === 0) return 0;
  let chosen = trace[0]?.y_m ?? 0;
  for (const sample of trace) {
    if (sample.t_ms > elapsedMs) break;
    chosen = sample.y_m;
  }
  return chosen;
}

export function demoDurationMs(trace: readonly VbtSample[]): number {
  return trace[trace.length - 1]?.t_ms ?? 0;
}
