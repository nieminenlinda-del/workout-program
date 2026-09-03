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

export const TEST_LIFT_ORDER = ['squat', 'bench', 'deadlift'] as const;
export type TestLift = (typeof TEST_LIFT_ORDER)[number];

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
  }): {
    template_day: SessionLog['template_day'];
    lifts: SessionLog['lifts'];
    freezeProgression: boolean;
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
