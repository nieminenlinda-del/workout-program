import { EXERCISE_CATALOG } from '../types/exercises';
import type {
  CanonicalTemplateDay,
  LoggedLift,
  SessionDraft,
  TemplateDay,
} from '../types/session';
import { DEFAULT_READINESS } from '../types/session';
import { DAY_TEMPLATES } from '../data/templates';
import { canonicalTemplateDay, todayIsoDate } from './templateDay';
import { withComputedLight } from './readiness';

export function newSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ses_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function liftsFromTemplate(day: CanonicalTemplateDay): LoggedLift[] {
  const template = DAY_TEMPLATES[day];
  return template.slots.map((slot) => {
    const meta = EXERCISE_CATALOG[slot.exercise_id];
    return {
      name: meta.name,
      style: meta.style,
      exercise_id: slot.exercise_id,
      sets: slot.sets.map((s) => ({
        weight_kg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
        completed: false,
        amrap: s.amrap,
      })),
    };
  });
}

export function createDraftSession(
  templateDay: TemplateDay = 'A',
  date = todayIsoDate(),
): SessionDraft {
  const canonical = canonicalTemplateDay(templateDay);
  return {
    session_id: newSessionId(),
    date,
    template_day: canonical,
    readiness: withComputedLight(DEFAULT_READINESS),
    lifts: liftsFromTemplate(canonical),
    pain_flag: false,
    notes: '',
    status: 'draft',
    updated_at: new Date().toISOString(),
  };
}

export function swapLiftExercise(draft: SessionDraft, liftIndex: number, exerciseId: LoggedLift['exercise_id']): SessionDraft {
  const meta = EXERCISE_CATALOG[exerciseId];
  const lifts = draft.lifts.map((lift, i) =>
    i === liftIndex
      ? { ...lift, exercise_id: exerciseId, name: meta.name, style: meta.style }
      : lift,
  );
  return { ...draft, lifts, updated_at: new Date().toISOString() };
}

export function completedSetCount(draft: SessionDraft): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const lift of draft.lifts) {
    for (const set of lift.sets) {
      total += 1;
      if (set.completed) done += 1;
    }
  }
  return { done, total };
}

export function toPersistedSession(draft: SessionDraft): SessionDraft {
  return {
    ...draft,
    status: 'complete',
    updated_at: new Date().toISOString(),
  };
}
