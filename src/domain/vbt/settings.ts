import { MIN_VELOCITY_M_S } from './velocity';
import type { VbtLiftKind } from './reps';

export interface VbtSettings {
  min_velocity_m_s: Record<VbtLiftKind, number>;
}

const STORAGE_KEY = 'linda-lift-vbt-mvt';

export function defaultVbtSettings(): VbtSettings {
  return { min_velocity_m_s: { ...MIN_VELOCITY_M_S } };
}

export function clampMinVelocity(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.round(Math.min(0.8, Math.max(0.05, value)) * 100) / 100;
}

export function readVbtSettings(): VbtSettings {
  const defaults = defaultVbtSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as { min_velocity_m_s?: Partial<Record<VbtLiftKind, number>> };
    const stored = parsed.min_velocity_m_s ?? {};
    return {
      min_velocity_m_s: {
        squat: clampMinVelocity(stored.squat ?? defaults.min_velocity_m_s.squat),
        bench: clampMinVelocity(stored.bench ?? defaults.min_velocity_m_s.bench),
        deadlift: clampMinVelocity(stored.deadlift ?? defaults.min_velocity_m_s.deadlift),
      },
    };
  } catch {
    return defaults;
  }
}

export function writeVbtSettings(settings: VbtSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode can refuse storage; the screen still uses the in-memory value */
  }
}
