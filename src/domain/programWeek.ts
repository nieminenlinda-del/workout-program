import { DAY_TEMPLATES, type DayTemplate, type TemplateSlot } from '../data/templates';
import type { CanonicalTemplateDay, SessionLog } from '../types/session';
import { MESOCYCLE_WINDOWS, type MesocycleBlock } from '../types/phase2';
import {
  blockPrescription,
  dropAccessorySlots,
  expandPrescription,
  holdNote,
  isPlannedDeload,
  isStepUp,
  previousWeekAnchor,
  shouldApplyHold,
  templateOverrideForDate,
  topSetRpeInWeek,
  type T1Prescription,
} from './cyclePlan';
import { calendarYmd } from './lastPerformance';
import { isProgressionFrozen } from './testWeek';

export type { T1Prescription, T1Wave } from './cyclePlan';

/**
 * Kraft trip: Linda started Block A Week 3 early on Sun 2026-09-20 (A+B same day).
 * Naive `weekIndexFromStart` still yields week 2 through 20 Sep inclusive
 * (Block A start 2026-09-07). Product week index / T1 table / home chip use
 * this boundary instead. Week 1 = 7–13; Week 2 = 14–19; Week 3 from 20 Sep.
 * Week 4 still starts 28 Sep (calendar). Do not use for Blocks B–C.
 */
export const BLOCK_A_WEEK3_EARLY_START = '2026-09-20';

/**
 * Inclusive week-of-block from the window start.
 * 2026-09-07 → 1, 2026-09-14 → 2, 2026-10-04 → 4.
 * Calendar dates only (UTC midnight) so Helsinki/UTC cannot shift the index.
 * Does **not** apply the Kraft Week-3-early trip override — see `programWeekIndex`.
 */
export function weekIndexFromStart(asOf: string, start: string): number {
  const day = calendarYmd(asOf) || asOf.slice(0, 10);
  const origin = calendarYmd(start) || start.slice(0, 10);
  const diffDays = Math.round((utcMs(day) - utcMs(origin)) / 86_400_000);
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Product week-of-block (home chip + T1 table).
 * Same as `weekIndexFromStart`, except Block A is at least week 3 from
 * `BLOCK_A_WEEK3_EARLY_START` (2026-09-20).
 */
export function programWeekIndex(asOf: string, start: string): number {
  const day = calendarYmd(asOf) || asOf.slice(0, 10);
  const origin = calendarYmd(start) || start.slice(0, 10);
  const calendarWeek = weekIndexFromStart(day, origin);
  const blockAStart = MESOCYCLE_WINDOWS.find((w) => w.block === 'A')?.start;
  if (blockAStart && origin === blockAStart && day >= BLOCK_A_WEEK3_EARLY_START) {
    return Math.max(calendarWeek, 3);
  }
  return calendarWeek;
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
    weekIndex: programWeekIndex(day, window.start),
    start: window.start,
    end: window.end,
  };
}

export type BlockAT1Week = 1 | 2 | 3 | 4;

/**
 * Block A T1 table (Kraft, Sep 2026). Not an auto-progression rule.
 *
 * Week 1 (rebase after 7 Sep): squat soft 47.5×3×5; bench 40×3×5; DL 70×3×5; Fri 40×2×5.
 * Week 2 (locked): squat 57.5×3×4 @ RPE ≤7 (55 if first set off); bench 40×3×5;
 * DL 70×3×4; Fri 40×2×5. Bench/DL hold load — no +2.5.
 * Week 3 (locked; early start 20 Sep): squat 60×3×3 @ RPE ≤8; bench 42.5×3×4;
 * DL 72.5×3×3; bench volume 42.5×2×4.
 * Week 4 (Mon 28 Sep–Sun 4 Oct) is a deload, all T1s @ RPE 5–6:
 * squat 45×2×5; bench 32.5×2×5; DL 55×2×5 (Wed or Thu); Fri bench 32.5×2×5.
 * A later Block A week would hold Week 3. Block B and C tables live in `cyclePlan`.
 * Accessories stay on the seed template.
 */
export const BLOCK_A_T1_BY_WEEK: Record<BlockAT1Week, Record<CanonicalTemplateDay, T1Prescription>> = {
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
  3: {
    A: {
      weight_kg: 60,
      set_count: 3,
      reps: 3,
      rpe: [7.5, 8, 8],
      note: 'Soft-cap ≤8 this week.',
    },
    B: { weight_kg: 42.5, set_count: 3, reps: 4, rpe: [7.5, 8, 8] },
    C: { weight_kg: 72.5, set_count: 3, reps: 3, rpe: [7.5, 8, 8] },
    D: { weight_kg: 42.5, set_count: 2, reps: 4, rpe: [7, 7.5] },
  },
  4: {
    A: { weight_kg: 45, set_count: 2, reps: 5, rpe: [5, 6], rpe_label: '5–6', note: 'Deload. RPE 5–6.' },
    B: { weight_kg: 32.5, set_count: 2, reps: 5, rpe: [5, 6], rpe_label: '5–6', note: 'Deload. RPE 5–6.' },
    C: { weight_kg: 55, set_count: 2, reps: 5, rpe: [5, 6], rpe_label: '5–6', note: 'Deload. RPE 5–6.' },
    D: { weight_kg: 32.5, set_count: 2, reps: 5, rpe: [5, 6], rpe_label: '5–6', note: 'Deload. RPE 5–6.' },
  },
};

/** Week 1 / 2 / 3 rows; Week 4 is the deload. Any later Block A week holds Week 3. */
function blockATableWeek(weekIndex: number): BlockAT1Week {
  if (weekIndex <= 1) return 1;
  if (weekIndex === 2) return 2;
  if (weekIndex === 4) return 4;
  return 3;
}

/** Block A Week 4 (28 Sep–4 Oct 2026). Block B week 4 is a separate deload. */
export function isBlockADeloadWeek(asOf: string): boolean {
  const ctx = blockWeekContext(asOf);
  return ctx?.block === 'A' && ctx.weekIndex === 4;
}

/** Block A week 4 and Block B week 4. */
export function isDeloadWeek(asOf: string): boolean {
  const ctx = blockWeekContext(asOf);
  return Boolean(ctx && isPlannedDeload(ctx.block, ctx.weekIndex));
}

export interface ProgramWeekOptions {
  logs?: readonly SessionLog[];
  /**
   * Today and a new draft apply the Block B hold. Block preview leaves this
   * off so future weeks stay the planned table (Projected).
   */
  hold?: boolean;
  /** Layout for the test week. Defaults to `TEST_DAY` (Fri 20 Nov 2026). */
  testDate?: string;
}

/** Week 1 / 2 / 3 row; Week 4 deload; later Block A weeks hold Week 3. Block B/C use their tables. Null off-block. */
export function t1PrescriptionFor(
  day: CanonicalTemplateDay,
  asOf: string,
): T1Prescription | null {
  const ctx = blockWeekContext(asOf);
  if (!ctx) return null;
  if (ctx.block === 'A') return BLOCK_A_T1_BY_WEEK[blockATableWeek(ctx.weekIndex)][day];
  return blockPrescription(ctx.block, ctx.weekIndex, day);
}

/**
 * Overlay the week's T1 onto the seed template.
 * Test-week dates replace the whole day. C1/C2 drop non-T1 slots.
 */
export function applyProgramWeek(
  template: DayTemplate,
  asOf: string,
  options: ProgramWeekOptions = {},
): DayTemplate {
  const override = templateOverrideForDate(asOf, options.testDate);
  if (override) return override;

  const rx = t1PrescriptionFor(template.id, asOf);
  if (!rx) return template;
  const ctx = blockWeekContext(asOf);
  let slots = template.slots.map((slot) => overlayT1(slot, rx));
  if (ctx && dropAccessorySlots(ctx.block, ctx.weekIndex)) {
    slots = slots.filter((slot) => slot.role === 'T1');
  }
  let next: DayTemplate = { ...template, slots };
  if (options.hold) next = applyHold(template.id, asOf, next, options.logs ?? [], options.testDate);
  return next;
}

export function dayTemplateForDate(
  day: CanonicalTemplateDay,
  asOf: string,
  options: ProgramWeekOptions = {},
): DayTemplate {
  return applyProgramWeek(DAY_TEMPLATES[day], asOf, options);
}

function overlayT1(slot: TemplateSlot, rx: T1Prescription): TemplateSlot {
  if (slot.role !== 'T1') return slot;
  const rest = slot.sets[0]?.rest_sec ?? 180;
  const sets = expandPrescription(rx, rest);
  return {
    ...slot,
    sets,
    note: rx.note,
    plan_label: rx.plan_label,
  };
}

function applyHold(
  day: CanonicalTemplateDay,
  asOf: string,
  template: DayTemplate,
  logs: readonly SessionLog[],
  testDate?: string,
): DayTemplate {
  const ctx = blockWeekContext(asOf);
  const planned = t1PrescriptionFor(day, asOf);
  if (!ctx || !planned) return template;
  const start = productWeekStart(asOf, ctx);
  const anchor = previousWeekAnchor(asOf, start);
  const previous = anchor ? t1PrescriptionFor(day, anchor) : null;
  const frozen = isProgressionFrozen(asOf, testDate);
  const bounds = anchor ? weekBounds(anchor) : null;
  const topRpe = bounds ? topSetRpeInWeek(logs, day, bounds.start, bounds.end) : null;
  if (
    !previous ||
    !shouldApplyHold({
      frozen,
      block: ctx.block,
      steppingUp: isStepUp(planned, previous),
      topRpe,
    })
  ) {
    return template;
  }
  const held: T1Prescription = { ...previous, note: holdNote(topRpe ?? 0) };
  return {
    ...template,
    slots: template.slots.map((slot) => overlayT1(slot, held)),
  };
}

function productWeekStart(day: string, ctx: { block: MesocycleBlock; weekIndex: number }): string {
  let cursor = day.slice(0, 10);
  for (let i = 0; i < 8; i += 1) {
    const prev = addDays(cursor, -1);
    const prevCtx = blockWeekContext(prev);
    if (!prevCtx || prevCtx.block !== ctx.block || prevCtx.weekIndex !== ctx.weekIndex) return cursor;
    cursor = prev;
  }
  return cursor;
}

function weekBounds(anchor: string): { start: string; end: string } | null {
  const ctx = blockWeekContext(anchor);
  if (!ctx) return null;
  const start = productWeekStart(anchor, ctx);
  let end = anchor.slice(0, 10);
  for (let i = 0; i < 8; i += 1) {
    const next = addDays(end, 1);
    const nextCtx = blockWeekContext(next);
    if (!nextCtx || nextCtx.block !== ctx.block || nextCtx.weekIndex !== ctx.weekIndex) break;
    end = next;
  }
  return { start, end };
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function utcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}
