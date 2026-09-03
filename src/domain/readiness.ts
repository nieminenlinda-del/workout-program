import type { Readiness, ReadinessLight } from '../types/session';

export const READINESS_KEYS = ['sleep', 'soreness', 'energy', 'pain', 'motivation'] as const;
export type ReadinessKey = (typeof READINESS_KEYS)[number];

export const READINESS_LABELS: Record<ReadinessKey, string> = {
  sleep: 'Sleep',
  soreness: 'Soreness',
  energy: 'Energy',
  pain: 'Pain',
  motivation: 'Motivation',
};

export const READINESS_HINTS: Record<ReadinessKey, { low: string; high: string }> = {
  sleep: { low: 'wrecked', high: 'deep' },
  soreness: { low: 'fresh', high: 'fried' },
  energy: { low: 'flat', high: 'amped' },
  pain: { low: 'none', high: 'sharp' },
  motivation: { low: 'meh', high: 'hungry' },
};

function clampScore(n: number): number {
  return Math.min(10, Math.max(1, Math.round(n)));
}

/** Auto light from scores. User may override on the readiness screen. */
export function computeReadinessLight(
  scores: Pick<Readiness, ReadinessKey>,
): ReadinessLight {
  if (scores.pain >= 7 || scores.soreness >= 8) return 'RED';
  if (
    scores.pain >= 5 ||
    scores.sleep <= 4 ||
    scores.energy <= 4 ||
    scores.motivation <= 4 ||
    scores.soreness >= 6
  ) {
    return 'YELLOW';
  }
  return 'GREEN';
}

export function withComputedLight(
  scores: Pick<Readiness, ReadinessKey>,
  override?: ReadinessLight,
): Readiness {
  const sleep = clampScore(scores.sleep);
  const soreness = clampScore(scores.soreness);
  const energy = clampScore(scores.energy);
  const pain = clampScore(scores.pain);
  const motivation = clampScore(scores.motivation);
  return {
    sleep,
    soreness,
    energy,
    pain,
    motivation,
    light: override ?? computeReadinessLight({ sleep, soreness, energy, pain, motivation }),
  };
}

export function shouldSuggestPainFlag(readiness: Readiness): boolean {
  return readiness.pain >= 5 || readiness.light === 'RED';
}
