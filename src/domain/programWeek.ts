import { DAY_TEMPLATES, type DayTemplate, type SeedSet, type TemplateSlot } from '../data/templates';
import type { CanonicalTemplateDay } from '../types/session';
import { MESOCYCLE_WINDOWS, type MesocycleBlock } from '../types/phase2';
import { calendarYmd } from './lastPerformance';

/** Kraft-locked T1 work prescription for one template day. */
export interface T1Prescription {
  weight_kg: number;
  set_count: number;
  reps: number;
  /** Per-set RPE; length matches `set_count`. */
  rpe: number[];
  /** Coaching line under the T1 name (Week 2 squat only). */
  note?: string;
}

/**
 * Inclusive week-of-block from the window start.
 * 2026-09-07 → 1, 2026-09-14 → 2, 2026-10-04 → 4.
 * Calendar dates only (UTC midnight) so Helsinki/UTC cannot shift the index.
 */
export function weekIndexFromStart(asOf: string, start: string): number {
  const day = calendarYmd(asOf) || asOf.slice(0, 10);
  const origin = calendarYmd(start) || start.slice(0, 10);
  const diffDays = Math.round((utcMs(day) - utcMs(origin)) / 86_400_000);
  return Math.floor(diffDays / 7) + 1;
}

export function blockWeekContext(asOf: string): {
  block: MesocycleBlock;
  weekIndex: number;
  start: string;
  end: string;
} | null {
  const day = calendarYmd(asOf) || asOf.slice(0, 10);
  const window = MESOCYCLE_WINDOWS.find((w) => day >= w.start && day <= w.end);
  if (!window) return null;
  return {
    block: window.block,
    weekIndex: weekIndexFromStart(day, window.start),
    start: window.start,
    end: window.end,
  };
}

/**
 * Block A T1 table (Kraft, Sep 2026). Not an auto-progression rule.
 *
 * Week 1 (rebase after 7 Sep): squat soft 47.5×3×5; bench 40×3×5; DL 70×3×5; Fri 40×2×5.
 * Week 2 (locked): squat 57.5×3×4 @ RPE ≤7 (55 if first set off); bench 40×3×5;
 * DL 70×3×4; Fri 40×2×5. Bench/DL hold load — no +2.5.
 * Weeks 3–4: no Kraft lock yet — hold Week 2. Accessories stay on the seed template.
 */
export const BLOCK_A_T1_BY_WEEK: Record<1 | 2, Record<CanonicalTemplateDay, T1Prescription>> = {
  1: {
    A: { weight_kg: 47.5, set_count: 3, reps: 5, rpe: [6.5, 6.5, 7] },
    B: { weight_kg: 40, set_count: 3, reps: 5, rpe: [6.5, 6.5, 7] },
    C: { weight_kg: 70, set_count: 3, reps: 5, rpe: [6.5, 6.5, 7] },
    D: { weight_kg: 40, set_count: 2, reps: 5, rpe: [6.5, 7] },
  },
  2: {
    A: {
      weight_kg: 57.5,
      set_count: 3,
      reps: 4,
      rpe: [7, 7, 7],
      note: 'Soft-cap ≤7 this week. 55 kg if first set is off.',
    },
    B: { weight_kg: 40, set_count: 3, reps: 5, rpe: [7, 7.5, 8] },
    C: { weight_kg: 70, set_count: 3, reps: 4, rpe: [7, 7.5, 8] },
    D: { weight_kg: 40, set_count: 2, reps: 5, rpe: [6.5, 7] },
  },
};

/** Week 1 row, or Week 2 for any Block A week ≥ 2. Null off-block / other blocks. */
export function t1PrescriptionFor(
  day: CanonicalTemplateDay,
  asOf: string,
): T1Prescription | null {
  const ctx = blockWeekContext(asOf);
  if (!ctx || ctx.block !== 'A') return null;
  const tableWeek: 1 | 2 = ctx.weekIndex <= 1 ? 1 : 2;
  return BLOCK_A_T1_BY_WEEK[tableWeek][day];
}

/** Overlay Block A T1 kg/reps onto the seed template. Accessories unchanged. */
export function applyProgramWeek(template: DayTemplate, asOf: string): DayTemplate {
  const rx = t1PrescriptionFor(template.id, asOf);
  if (!rx) return template;
  return {
    ...template,
    slots: template.slots.map((slot) => overlayT1(slot, rx)),
  };
}

export function dayTemplateForDate(day: CanonicalTemplateDay, asOf: string): DayTemplate {
  return applyProgramWeek(DAY_TEMPLATES[day], asOf);
}

function overlayT1(slot: TemplateSlot, rx: T1Prescription): TemplateSlot {
  if (slot.role !== 'T1') return slot;
  const rest = slot.sets[0]?.rest_sec ?? 180;
  const sets: SeedSet[] = Array.from({ length: rx.set_count }, (_, i) => ({
    weight_kg: rx.weight_kg,
    reps: rx.reps,
    rpe: rx.rpe[i] ?? rx.rpe[rx.rpe.length - 1] ?? 7,
    rest_sec: rest,
  }));
  return rx.note ? { ...slot, sets, note: rx.note } : { ...slot, sets, note: undefined };
}

function utcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}
