import type { SessionDraft } from '../types/session';
import {
  EQUIPMENT_IDS,
  EQUIPMENT_LABELS,
  exerciseEquipment,
  type Equipment,
  type ExerciseId,
} from '../types/exercises';

export type EquipmentSlot = {
  role?: string;
  exercise_id: ExerciseId;
  alternatives: readonly ExerciseId[];
};

export function slotExerciseIds(slot: EquipmentSlot): ExerciseId[] {
  return [slot.exercise_id, ...slot.alternatives];
}

/** T1 competition lifts stay barbell-only. Accessory / core / optional can swap. */
export function slotAllowsEquipmentPicker(slot: EquipmentSlot): boolean {
  return slot.role !== 'T1';
}

export function equipmentOptionsForSlot(slot: EquipmentSlot): Equipment[] {
  const available = new Set(slotExerciseIds(slot).map(exerciseEquipment));
  return EQUIPMENT_IDS.filter((eq) => available.has(eq));
}

/** First catalog ID in the slot that uses this implement. Keep current if it already matches. */
export function exerciseForEquipment(
  slot: EquipmentSlot,
  equipment: Equipment,
  currentId?: ExerciseId,
): ExerciseId | null {
  const ids = slotExerciseIds(slot);
  if (currentId && ids.includes(currentId) && exerciseEquipment(currentId) === equipment) {
    return currentId;
  }
  return ids.find((id) => exerciseEquipment(id) === equipment) ?? null;
}

export function liftEquipment(lift: { exercise_id: ExerciseId; equipment?: Equipment }): Equipment {
  return lift.equipment ?? exerciseEquipment(lift.exercise_id);
}

export function equipmentChipLabel(equipment: Equipment): string {
  return EQUIPMENT_LABELS[equipment];
}

export const BAR_KG_OPTIONS = [10, 15, 20] as const;
export const DEFAULT_BAR_KG = 15;
export const BAR_KG_PREF_KEY = 'linda-lift-bar-kg';

export function clampBarKg(kg: number): number {
  if (!Number.isFinite(kg)) return DEFAULT_BAR_KG;
  const rounded = Math.round(kg);
  if ((BAR_KG_OPTIONS as readonly number[]).includes(rounded)) return rounded;
  if (rounded < 12.5) return 10;
  if (rounded < 17.5) return 15;
  return 20;
}

export function loadPreferredBarKg(): number {
  try {
    const raw = localStorage.getItem(BAR_KG_PREF_KEY);
    if (raw == null) return DEFAULT_BAR_KG;
    return clampBarKg(Number(raw));
  } catch {
    return DEFAULT_BAR_KG;
  }
}

export function savePreferredBarKg(kg: number): void {
  try {
    localStorage.setItem(BAR_KG_PREF_KEY, String(clampBarKg(kg)));
  } catch {
    /* private mode */
  }
}

export function setLiftBarKg(draft: SessionDraft, liftIndex: number, kg: number): SessionDraft {
  const bar_kg = clampBarKg(kg);
  savePreferredBarKg(bar_kg);
  return {
    ...draft,
    lifts: draft.lifts.map((lift, i) => (i === liftIndex ? { ...lift, bar_kg } : lift)),
    updated_at: new Date().toISOString(),
  };
}
