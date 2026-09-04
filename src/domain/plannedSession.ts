import { DAY_TEMPLATES, exerciseName, type DayTemplate, type SeedSet, type TemplateSlot } from '../data/templates';
import { formatClock } from './countdown';
import type { CanonicalTemplateDay } from '../types/session';
import type { ExerciseId } from '../types/exercises';

export interface PlannedSet {
  weight_kg: number;
  reps: number;
  rpe: number;
  amrap?: boolean;
  rest_sec: number;
}

export interface PlannedLift {
  slot_id: string;
  role: TemplateSlot['role'];
  exercise_id: ExerciseId;
  name: string;
  alternatives: string[];
  optional: boolean;
  sets: PlannedSet[];
  setsRepsLabel: string;
  restLabel: string | null;
}

/** Read-only view of a day template. Never a SessionDraft. */
export interface PlannedSession {
  template_day: CanonicalTemplateDay;
  weekday: DayTemplate['weekday'];
  title: string;
  focus: string;
  lifts: PlannedLift[];
}

export function plannedSessionFor(day: CanonicalTemplateDay): PlannedSession {
  const template = DAY_TEMPLATES[day];
  return plannedSessionFromTemplate(template);
}

export function plannedSessionFromTemplate(template: DayTemplate): PlannedSession {
  return {
    template_day: template.id,
    weekday: template.weekday,
    title: template.title,
    focus: template.focus,
    lifts: template.slots.map(plannedLiftFromSlot),
  };
}

export function plannedLiftFromSlot(slot: TemplateSlot): PlannedLift {
  return {
    slot_id: slot.slot_id,
    role: slot.role,
    exercise_id: slot.exercise_id,
    name: exerciseName(slot.exercise_id),
    alternatives: uniqueAltNames(slot.exercise_id, slot.alternatives),
    optional: Boolean(slot.optional),
    sets: slot.sets.map(plannedSetFromSeed),
    setsRepsLabel: formatSetsReps(slot.sets),
    restLabel: formatUniformRest(slot.sets),
  };
}

export function plannedSetFromSeed(set: SeedSet): PlannedSet {
  return {
    weight_kg: set.weight_kg,
    reps: set.reps,
    rpe: set.rpe,
    amrap: set.amrap,
    rest_sec: set.rest_sec,
  };
}

export function formatSetsReps(sets: SeedSet[] | PlannedSet[]): string {
  if (sets.length === 0) return '—';
  const allSameReps = sets.every((s) => s.reps === sets[0].reps);
  if (allSameReps) {
    if (sets.every((s) => s.amrap)) return `${sets.length} × ${sets[0].reps}+`;
    return `${sets.length} × ${sets[0].reps}`;
  }
  return sets.map((s) => `${s.reps}${s.amrap ? '+' : ''}`).join(' / ');
}

export function formatUniformRest(sets: SeedSet[] | PlannedSet[]): string | null {
  if (sets.length === 0) return null;
  const first = sets[0].rest_sec;
  if (!sets.every((s) => s.rest_sec === first)) return null;
  return formatClock(first);
}

export function formatLoad(weightKg: number): string {
  return weightKg > 0 ? `${weightKg} kg` : 'BW';
}

export function uniqueAltNames(primary: ExerciseId, alternatives: ExerciseId[]): string[] {
  const primaryName = exerciseName(primary);
  return [...new Set(alternatives.map(exerciseName).filter((name) => name !== primaryName))];
}
