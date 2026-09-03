import type { BlockPhase, MesocycleContext, ProgramMode, TrainingMode } from '../types/phase2';
import {
  MESOCYCLE_WINDOWS,
  PEAKING_PHASES,
  TARGET_TEST_DATE,
  TEST_DAY,
  TEST_LIFT_ORDER,
  programModeFrom,
} from '../types/phase2';

function isoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function isPeakingPhase(phase: BlockPhase | null): boolean {
  return phase !== null && (PEAKING_PHASES as readonly string[]).includes(phase);
}

/**
 * PowerCombo mode switch (calendar only — not load selection).
 * Hypertrophy between meets; strength_peak only while `target_test_date` is in the peaking window.
 * After the test date, auto-return to hypertrophy unless a new test date is supplied.
 */
export function resolveTrainingMode(
  asOf: string,
  phase: BlockPhase | null,
  targetTestDate: string | null = TARGET_TEST_DATE,
): TrainingMode {
  if (!targetTestDate) return 'hypertrophy';
  if (asOf > targetTestDate) return 'hypertrophy';
  if (isPeakingPhase(phase)) return 'strength_peak';
  return 'hypertrophy';
}

/**
 * Calendar lookup only — not a progression engine.
 * Used as a Phase 2 design hook (chip on the home screen).
 */
export function getMesocycleContext(
  asOf: string | Date = new Date(),
  targetTestDate: string | null = TARGET_TEST_DATE,
): MesocycleContext {
  const date = isoDate(asOf);
  const isTestDay = Boolean(targetTestDate) && date === targetTestDate;
  const window = MESOCYCLE_WINDOWS.find((w) => date >= w.start && date <= w.end) ?? null;

  let phase = window?.defaultPhase ?? null;
  if (isTestDay) {
    phase = 'test';
  } else if (window?.block === 'C' && date >= '2026-11-17' && date < (targetTestDate ?? TEST_DAY)) {
    phase = 'peak_taper';
  }

  const freezeProgression = phase === 'peak_taper' || phase === 'test';
  const training_mode = resolveTrainingMode(date, phase, targetTestDate);
  const program_mode: ProgramMode = programModeFrom(training_mode);

  return {
    asOf: date,
    block: window?.block ?? null,
    phase,
    window,
    isTestDay,
    freezeProgression,
    testLiftOrder: TEST_LIFT_ORDER,
    target_test_date: targetTestDate,
    training_mode,
    program_mode,
  };
}
