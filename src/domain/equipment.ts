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
