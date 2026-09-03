import type { MesocycleContext } from '../types/phase2';
import { MESOCYCLE_WINDOWS, TEST_DAY, TEST_LIFT_ORDER } from '../types/phase2';

function isoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Calendar lookup only — not a progression engine.
 * Used as a Phase 2 design hook (chip on the home screen).
 */
export function getMesocycleContext(asOf: string | Date = new Date()): MesocycleContext {
  const date = isoDate(asOf);
  const isTestDay = date === TEST_DAY;
  const window = MESOCYCLE_WINDOWS.find((w) => date >= w.start && date <= w.end) ?? null;

  let phase = window?.defaultPhase ?? null;
  if (isTestDay) {
    phase = 'test';
  } else if (window?.block === 'C' && date >= '2026-11-17') {
    phase = 'peak_taper';
  }

  const freezeProgression = phase === 'peak_taper' || phase === 'test';

  return {
    asOf: date,
    block: window?.block ?? null,
    phase,
    window,
    isTestDay,
    freezeProgression,
    testLiftOrder: TEST_LIFT_ORDER,
  };
}
