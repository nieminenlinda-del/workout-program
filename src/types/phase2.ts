/**
 * Phase 2 plug-in types only.
 * Do not implement the progression engine here — see ARCHITECTURE.md.
 */
import type { SessionLog } from './session';

/** Documented training maxes (kg). Used by types/docs; not a live calculator. */
export interface TrainingMaxes {
  squat_kg: number;
  bench_kg: number;
  deadlift_kg: number;
}

export const SEED_TRAINING_MAXES: TrainingMaxes = {
  squat_kg: 67.5,
  bench_kg: 50,
  deadlift_kg: 85,
};

export type MesocycleBlock = 'A' | 'B' | 'C';

export type BlockPhase =
  | 'accumulate'
  | 'intensify'
  | 'peak_overreach'
  | 'peak_taper'
  | 'test';

export interface MesocycleWindow {
  block: MesocycleBlock;
  label: string;
  start: string;
  end: string;
  defaultPhase: BlockPhase;
}

export const TEST_DAY = '2026-11-21';

/** Active meet/test target for this cycle. After this date, mode returns to hypertrophy unless a new date is set. */
export const TARGET_TEST_DATE = TEST_DAY;

export const TEST_LIFT_ORDER = ['squat', 'bench', 'deadlift'] as const;
export type TestLift = (typeof TEST_LIFT_ORDER)[number];

/**
 * Juggernaut PowerCombo training mode (Phase 2 engine input).
 * Hypertrophy between meets; strength_peak only inside the peaking window for `target_test_date`.
 */
export type TrainingMode = 'hypertrophy' | 'strength_peak';

/**
 * Product alias for the same switch: `peak` === `strength_peak`.
 * Prefer `TrainingMode` in engine code.
 */
export type ProgramMode = 'hypertrophy' | 'peak';

export function programModeFrom(training: TrainingMode): ProgramMode {
  return training === 'strength_peak' ? 'peak' : 'hypertrophy';
}

export function trainingModeFrom(program: ProgramMode): TrainingMode {
  return program === 'peak' ? 'strength_peak' : 'hypertrophy';
}

export const PEAKING_PHASES: readonly BlockPhase[] = [
  'peak_overreach',
  'peak_taper',
  'test',
];

/**
 * Documented auto-progression hooks. Phase 2 engines must read these;
 * Phase 1 does not apply them to prescribed loads.
 */
export interface StrengthPeakProgressionHook {
  t1_load_increment_kg: 2.5;
  optional_amrap: true;
  tm_bump_pct_after_green_block: 2.5;
  freeze_on: readonly ('peak_taper' | 'test')[];
}

export interface HypertrophyProgressionHook {
  progress: 'reps_before_load';
  hypertrophy_rep_range: readonly [6, 12];
  tm_recalc_every_weeks: readonly [8, 12];
  tm_recalc_after_test: true;
  deload_every_weeks: readonly [4, 6];
}

export const STRENGTH_PEAK_PROGRESSION_HOOK: StrengthPeakProgressionHook = {
  t1_load_increment_kg: 2.5,
  optional_amrap: true,
  tm_bump_pct_after_green_block: 2.5,
  freeze_on: ['peak_taper', 'test'],
};

export const HYPERTROPHY_PROGRESSION_HOOK: HypertrophyProgressionHook = {
  progress: 'reps_before_load',
  hypertrophy_rep_range: [6, 12],
  tm_recalc_every_weeks: [8, 12],
  tm_recalc_after_test: true,
  deload_every_weeks: [4, 6],
};

/**
 * Calendar windows for the 2026 test cycle.
 * Block A ~8 Sep–5 Oct · B ~6 Oct–2 Nov · C ~3–21 Nov.
 */
export const MESOCYCLE_WINDOWS: readonly MesocycleWindow[] = [
  {
    block: 'A',
    label: 'Accumulate',
    start: '2026-09-08',
    end: '2026-10-05',
    defaultPhase: 'accumulate',
  },
  {
    block: 'B',
    label: 'Intensify',
    start: '2026-10-06',
    end: '2026-11-02',
    defaultPhase: 'intensify',
  },
  {
    block: 'C',
    label: 'Peak',
    start: '2026-11-03',
    end: '2026-11-21',
    defaultPhase: 'peak_overreach',
  },
] as const;

export interface MesocycleContext {
  asOf: string;
  block: MesocycleBlock | null;
  phase: BlockPhase | null;
  window: MesocycleWindow | null;
  isTestDay: boolean;
  /** When true, Phase 2 must not mutate loads (taper + test). */
  freezeProgression: boolean;
  testLiftOrder: readonly TestLift[];
  target_test_date: string | null;
  training_mode: TrainingMode;
  /** Alias of training_mode (`peak` === `strength_peak`). */
  program_mode: ProgramMode;
}

/**
 * Phase 2 engine contract. Implementations must:
 * - consume persisted SessionLog rows
 * - freeze prescription changes when freezeProgression is true
 * - on TEST_DAY prescribe squat → bench → deadlift, nothing else
 *
 * Phase 1 must not call this. A stub throws so the surface is typed and unused.
 */
export interface ProgressionEngine {
  proposeNext(input: {
    logs: SessionLog[];
    trainingMaxes: TrainingMaxes;
    asOf: string;
    training_mode: TrainingMode;
    target_test_date: string | null;
  }): {
    template_day: SessionLog['template_day'];
    lifts: SessionLog['lifts'];
    freezeProgression: boolean;
    training_mode: TrainingMode;
  };
}

export class Phase2NotImplementedError extends Error {
  constructor() {
    super('Phase 2 progression engine is not implemented.');
    this.name = 'Phase2NotImplementedError';
  }
}

/** Typed placeholder — do not wire into the session UI. */
export const progressionEngineStub: ProgressionEngine = {
  proposeNext() {
    throw new Phase2NotImplementedError();
  },
};
