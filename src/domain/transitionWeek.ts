import type { DayTemplate, SeedSet, TemplateSlot } from '../data/templates';
import type { CanonicalTemplateDay } from '../types/session';
import { LOADS_FROM_KRAFT } from './uiLang';
import { isWarmupSet } from './sets';

/**
 * Lighter week after the 20 Nov test. Only these dates. Later weeks stay
 * on their own tables. Fill a slot id when Kraft sends the check-in loads;
 * null keeps the load blank.
 */
export const TRANSITION_WEEK_LOADS: Record<'B' | 'C' | 'D', Record<string, number | null>> = {
  B: {},
  C: {},
  D: {},
};

const TRANSITION_DAY: Record<string, 'B' | 'C' | 'D'> = {
  '2026-11-24': 'B',
  '2026-11-26': 'C',
  '2026-11-27': 'D',
};

export function isTransitionLoadDay(asOf: string, day: CanonicalTemplateDay): boolean {
  return TRANSITION_DAY[asOf.slice(0, 10)] === day;
}

/** Same exercises as the scheduled day. Work loads are blank until Kraft fills them. */
export function blankTransitionTemplate(template: DayTemplate): DayTemplate {
  const loads = TRANSITION_WEEK_LOADS[template.id as 'B' | 'C' | 'D'] ?? {};
  return {
    ...template,
    focus: LOADS_FROM_KRAFT,
    slots: template.slots.map((slot) => blankSlot(slot, loads[slot.slot_id])),
  };
}

function blankSlot(slot: TemplateSlot, known: number | null | undefined): TemplateSlot {
  const work = slot.sets.filter((set) => !isWarmupSet(set));
  const sets: SeedSet[] = (work.length > 0 ? work : slot.sets).map((set) => {
    if (known != null && known > 0) {
      return { ...set, weight_kg: known, open_load: false };
    }
    return { ...set, weight_kg: 0, open_load: true };
  });
  return {
    ...slot,
    skipWarmup: true,
    plan_label: known != null && known > 0 ? undefined : LOADS_FROM_KRAFT,
    sets,
  };
}
