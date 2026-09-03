import type { ExerciseId } from './exercises';

/** Training-day letter (A–D) or weekday alias (Mon/Tue/Thu/Fri). */
export type TemplateDay = 'Mon' | 'Tue' | 'Thu' | 'Fri' | 'A' | 'B' | 'C' | 'D';

export type CanonicalTemplateDay = 'A' | 'B' | 'C' | 'D';

export type ReadinessLight = 'GREEN' | 'YELLOW' | 'RED';

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
}

export interface LoggedLift {
  name: string;
  style?: string;
  exercise_id: ExerciseId;
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
  notes: string;
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
