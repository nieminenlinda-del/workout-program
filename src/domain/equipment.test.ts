import { describe, expect, it } from 'vitest';
import { DAY_TEMPLATES } from '../data/templates';
import {
  clampBarKg,
  DEFAULT_BAR_KG,
  equipmentOptionsForSlot,
  exerciseForEquipment,
  setLiftBarKg,
  slotAllowsEquipmentPicker,
} from './equipment';
import { createDraftSession, swapLiftExercise } from './sessionFactory';
import { exerciseEquipment } from '../types/exercises';

describe('accessory equipment from slot alternatives', () => {
  it('maps Day B row barbell vs dumbbells to existing IDs', () => {
    const slot = DAY_TEMPLATES.B.slots.find((s) => s.slot_id === 'b-row');
    if (!slot) throw new Error('missing b-row');
    expect(equipmentOptionsForSlot(slot)).toEqual(['barbell', 'dumbbells']);
    expect(exerciseForEquipment(slot, 'dumbbells')).toBe('row_db');
    expect(exerciseForEquipment(slot, 'barbell', 'row_db')).toBe('row_barbell');
    expect(slotAllowsEquipmentPicker(slot)).toBe(true);
  });

  it('maps Day D light squat barbell vs DBs without adding exercises', () => {
    const slot = DAY_TEMPLATES.D.slots.find((s) => s.slot_id === 'd-squat');
    if (!slot) throw new Error('missing d-squat');
    expect(equipmentOptionsForSlot(slot)).toEqual(['barbell', 'dumbbells']);
    expect(exerciseForEquipment(slot, 'dumbbells')).toBe('goblet_squat');
    expect(exerciseForEquipment(slot, 'dumbbells', 'squat_goblet')).toBe('squat_goblet');
  });

  it('maps Day D pull-up bodyweight vs bands', () => {
    const slot = DAY_TEMPLATES.D.slots.find((s) => s.slot_id === 'd-pull');
    if (!slot) throw new Error('missing d-pull');
    expect(equipmentOptionsForSlot(slot)).toEqual(['bands', 'bodyweight']);
    expect(exerciseForEquipment(slot, 'bands')).toBe('pull_up_band');
    expect(exerciseForEquipment(slot, 'bodyweight')).toBe('pull_up');
  });

  it('maps Day D tricep cable vs bands and stamps cable on a new Friday draft', () => {
    const slot = DAY_TEMPLATES.D.slots.find((s) => s.slot_id === 'd-tri');
    if (!slot) throw new Error('missing d-tri');
    expect(equipmentOptionsForSlot(slot)).toEqual(['cable', 'bands']);
    expect(exerciseForEquipment(slot, 'cable')).toBe('tricep_pushdown_cable');
    expect(exerciseForEquipment(slot, 'bands')).toBe('tricep_pushdown_band');
    expect(exerciseEquipment('tricep_pushdown_cable')).toBe('cable');
    const friday = createDraftSession('D', '2026-09-11');
    const tri = friday.lifts.find((l) => l.exercise_id === 'tricep_pushdown_cable');
    expect(tri).toMatchObject({
      exercise_id: 'tricep_pushdown_cable',
      name: 'Cable rope pushdown',
      equipment: 'cable',
    });
    expect(tri?.sets.filter((s) => !s.warmup).map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }))).toEqual([
      { weight_kg: 12.5, reps: 12 },
      { weight_kg: 12.5, reps: 12 },
    ]);
    const triIndex = friday.lifts.findIndex((l) => l.exercise_id === 'tricep_pushdown_cable');
    const swapped = swapLiftExercise(friday, triIndex, 'tricep_pushdown_band');
    expect(swapped.lifts[triIndex]).toMatchObject({
      exercise_id: 'tricep_pushdown_band',
      name: 'Band tricep pushdown',
      equipment: 'bands',
    });
  });

  it('does not offer an equipment picker on T1 squat', () => {
    const slot = DAY_TEMPLATES.A.slots[0];
    expect(slot?.role).toBe('T1');
    expect(slotAllowsEquipmentPicker(slot!)).toBe(false);
    expect(exerciseEquipment('squat_low_bar')).toBe('barbell');
  });

  it('swapping equipment persists the catalog ID on the draft lift', () => {
    const draft = createDraftSession('B', '2026-09-08');
    const row = draft.lifts.find((l) => l.exercise_id === 'row_barbell');
    expect(row?.equipment).toBe('barbell');
    const swapped = swapLiftExercise(draft, 1, 'row_db');
    expect(swapped.lifts[1]).toMatchObject({
      exercise_id: 'row_db',
      name: 'DB row',
      equipment: 'dumbbells',
    });
  });

  it('clamps bar mass to 10 / 15 / 20 and stores it on the lift', () => {
    expect(clampBarKg(15)).toBe(15);
    expect(clampBarKg(20)).toBe(20);
    expect(clampBarKg(12)).toBe(10);
    expect(clampBarKg(Number.NaN)).toBe(DEFAULT_BAR_KG);
    const draft = createDraftSession('A', '2026-09-07');
    const withBar = setLiftBarKg(draft, 0, 15);
    expect(withBar.lifts[0]?.bar_kg).toBe(15);
  });
});
