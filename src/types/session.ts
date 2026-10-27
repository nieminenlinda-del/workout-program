import type { Equipment, ExerciseId } from './exercises';

/** Training-day letter (A–D) or weekday alias (Mon/Tue/Thu/Fri). */
export type TemplateDay = 'Mon' | 'Tue' | 'Thu' | 'Fri' | 'A' | 'B' | 'C' | 'D';

export type CanonicalTemplateDay = 'A' | 'B' | 'C' | 'D';

export type ReadinessLight = 'GREEN' | 'YELLOW' | 'RED';

/** Optional area on the session pain flag. */
export type PainArea = 'right_shoulder' | 'right_trap_neck' | 'other';

export const PAIN_AREA_LABELS: Record<PainArea, string> = {
  right_shoulder: 'Right shoulder',
  right_trap_neck: 'Right trap / neck',
  other: 'Other',
};

/** Squat bar position. Missing on older logs means low-bar. */
export type BarPosition = 'low_bar' | 'high_bar';

export function isPainArea(value: unknown): value is PainArea {
  return value === 'right_shoulder' || value === 'right_trap_neck' || value === 'other';
}

export function isBarPosition(value: unknown): value is BarPosition {
  return value === 'low_bar' || value === 'high_bar';
}

export interface Readiness {
  sleep: number;
  soreness: number;
  energy: number;
  pain: number;
  motivation: number;
  light: ReadinessLight;
}

export interface LoggedSet {
  weight_kg: number;
  reps: number;
  rpe: number;
  completed: boolean;
  amrap?: boolean;
  /** True for seeded warmup sets. Must not count as a work set for last-week / Phase 2. */
  warmup?: boolean;
  /**
   * Programmed target for this slot. Logging a set must not overwrite later
   * unfinished slots’ targets. Missing on older drafts — treat `weight_kg` /
   * `reps` as the prescription until a log or working-weight edit writes these.
   */
  target_weight_kg?: number;
  target_reps?: number;
  /**
   * Programmed RPE when the target is a band (`5–6`). Logging still writes a
   * number on `rpe`. Missing on older drafts.
   */
  rpe_label?: string;
  /** Top / backoff label copied from the plan. */
  part_label?: string;
  /** Planned range such as `77.5–80`. Logging still stores a number on `weight_kg`. */
  weight_label?: string;
  /**
   * No programmed load. `weight_kg` stays 0 until Linda types the dumbbell.
   * Older logs omit it.
   */
  open_load?: boolean;
}

export interface LoggedLift {
  name: string;
  style?: string;
  exercise_id: ExerciseId;
  /** Template slot this lift was built from. Keeps a back-off row apart from the top sets. */
  slot_id?: string;
  /** Snapshot of catalog equipment. Older logs omit this — derive from `exercise_id`. */
  equipment?: Equipment;
  /** Barbell mass in kg (15 women’s / 20 standard). Omitted on DB / BW / bands / cable. */
  bar_kg?: number;
  /** Low-bar or high-bar on a barbell squat. Omitted on other lifts. */
  bar_position?: BarPosition;
  sets: LoggedSet[];
}

/**
 * Phase 1 persisted session. This is the contract Phase 2 auto-progression
 * will consume — keep the shape stable.
 */
export interface SessionLog {
  session_id: string;
  date: string;
  template_day: TemplateDay;
  readiness: Readiness;
  lifts: LoggedLift[];
  pain_flag: boolean;
  /** Set with the pain flag. Older logs omit it. */
  pain_area?: PainArea;
  /** Short note for `pain_area`. Older logs omit it. */
  pain_note?: string;
  notes: string;
  /**
   * When `false`, the session is logged but does not feed training-max
   * autoregulation (e1RM, hard sets, Block B hold, accessory progression).
   * Missing on older logs — those still count.
   */
  counts_toward_tm?: boolean;
}

/** Recovery week sets this false. Older logs omit it and still count. */
export function countsTowardTrainingMax(session: { counts_toward_tm?: boolean }): boolean {
  return session.counts_toward_tm !== false;
}

export interface SessionDraft extends SessionLog {
  status: 'draft' | 'complete';
  updated_at: string;
}

export const DEFAULT_READINESS: Readiness = {
  sleep: 7,
  soreness: 3,
  energy: 7,
  pain: 1,
  motivation: 7,
  light: 'GREEN',
};
