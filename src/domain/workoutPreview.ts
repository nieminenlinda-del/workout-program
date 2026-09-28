import { exerciseName, type DayTemplate, type SeedSet, type TemplateSlot } from '../data/templates';
import { isAssistedLoad, isTimedHold, type ExerciseId } from '../types/exercises';
import type { SessionLog } from '../types/session';
import { formatClock } from './countdown';
import { formatLoad } from './formatLoad';
import {
  formatLastPerformance,
  lastMatchingPerformance,
  type LastPerformance,
} from './lastPerformance';
import { applyProgramWeek } from './programWeek';
import { isWarmupSet, setDisplayLabel, workSets } from './sets';
import { attachWarmups, warmupKindFor } from './warmupLadder';

export interface PlannedSetLine {
  setNumber: number;
  label: string;
  weight_kg: number;
  reps: number;
  rpe: number;
  /** Planned band such as `5–6`, when the target is not a single RPE. */
  rpe_label?: string;
  part_label?: string;
  weight_label?: string;
  amrap: boolean;
  rest_sec: number;
  warmup: boolean;
}

export interface PlannedLiftSummary {
  slot_id: string;
  role: TemplateSlot['role'];
  name: string;
  alternatives: string[];
  optional: boolean;
  scheme: string;
  /** `57.5 kg · 3 × 4` — work kg first so the collapsed line is not a warmup trail. */
  workLabel: string;
  warmupLabel: string | null;
  restLabel: string | null;
  note: string | null;
  timed: boolean;
  assisted: boolean;
  sets: PlannedSetLine[];
}

/** Template row plus the same Last: lookup used in-session. Still not a draft. */
export interface PlannedLiftPreview extends PlannedLiftSummary {
  exercise_id: ExerciseId;
  last: LastPerformance | null;
  lastLine: string;
}

/** Alternative names that differ from the programmed lift (read-only preview). */
export function uniqueAltNames(primary: ExerciseId, alternatives: ExerciseId[]): string[] {
  const primaryName = exerciseName(primary);
  return [...new Set(alternatives.map(exerciseName).filter((name) => name !== primaryName))];
}

export { formatLoad } from './formatLoad';

/** Compact work-set scheme, e.g. `4 × 5+` or `3 × 8, 2 × 6`. Warmups omitted. */
export function formatSetScheme(sets: SeedSet[], timed = false): string {
  const work = workSets(sets);
  if (work.length === 0) return '';
  const unit = timed ? 's' : '';
  const reps = work.map((s) => s.reps);
  const allSameReps = reps.every((r) => r === reps[0]);
  const anyAmrap = work.some((s) => s.amrap);
  if (allSameReps) {
    return `${work.length} × ${reps[0]}${unit}${anyAmrap ? '+' : ''}`;
  }

  const groups: { reps: number; count: number; amrap: boolean }[] = [];
  for (const set of work) {
    const amrap = Boolean(set.amrap);
    const last = groups[groups.length - 1];
    if (last && last.reps === set.reps && last.amrap === amrap) {
      last.count += 1;
    } else {
      groups.push({ reps: set.reps, count: 1, amrap });
    }
  }
  return groups
    .map((g) => `${g.count} × ${g.reps}${unit}${g.amrap ? '+' : ''}`)
    .join(', ');
}

export function formatRestLabel(restSec: number): string {
  return `${formatClock(restSec)} rest`;
}

export function uniformRestSeconds(sets: SeedSet[]): number | null {
  const work = workSets(sets);
  if (work.length === 0) return null;
  const first = work[0].rest_sec;
  if (work.some((s) => s.rest_sec !== first)) return null;
  return first;
}

export function formatWarmupLabel(sets: SeedSet[]): string | null {
  const warm = sets.filter(isWarmupSet);
  if (warm.length === 0) return null;
  const kg = warm.map((s) => formatLoad(s.weight_kg));
  return `W ${kg.join(' → ')}`;
}

/**
 * Collapsed work line, e.g. `57.5 kg · 3 × 4`.
 * Mixed loads read as two parts: `67.5 kg × 1 then 60 kg × 2 × 2`.
 */
export function formatWorkLabel(sets: SeedSet[], timed = false, assisted = false): string {
  const work = workSets(sets);
  const scheme = formatSetScheme(sets, timed);
  if (work.length === 0) return scheme;
  const waves = formatWaveLabel(work, timed, assisted);
  if (waves) return waves;
  const first = work[0].weight_kg;
  return `${formatLoad(first, assisted)} · ${scheme}`;
}

function formatWaveLabel(
  work: readonly SeedSet[],
  timed: boolean,
  assisted: boolean,
): string | null {
  const groups: { weight: number; label?: string; reps: number; count: number; amrap: boolean }[] = [];
  for (const set of work) {
    const amrap = Boolean(set.amrap);
    const last = groups[groups.length - 1];
    if (
      last &&
      last.weight === set.weight_kg &&
      last.label === set.weight_label &&
      last.reps === set.reps &&
      last.amrap === amrap
    ) {
      last.count += 1;
    } else {
      groups.push({
        weight: set.weight_kg,
        label: set.weight_label,
        reps: set.reps,
        count: 1,
        amrap,
      });
    }
  }
  const mixed = groups.length > 1 || Boolean(groups[0]?.label);
  if (!mixed) return null;
  const unit = timed ? 's' : '';
  return groups
    .map((group) => {
      const kg = group.label ? `${group.label} kg` : formatLoad(group.weight, assisted);
      const reps = `${group.reps}${unit}${group.amrap ? '+' : ''}`;
      if (group.count === 1 && group.reps === 1 && !group.amrap) return `${kg} × ${reps}`;
      return `${kg} × ${group.count} × ${reps}`;
    })
    .join(' then ');
}

export function plannedLiftSummary(slot: TemplateSlot): PlannedLiftSummary {
  const sets = slot.skipWarmup ? slot.sets : attachWarmups(slot.sets, warmupKindFor(slot.exercise_id));
  const restSec = uniformRestSeconds(sets);
  const timed = isTimedHold(slot.exercise_id);
  const assisted = isAssistedLoad(slot.exercise_id);
  return {
    slot_id: slot.slot_id,
    role: slot.role,
    name: slot.displayName ?? exerciseName(slot.exercise_id),
    alternatives: uniqueAltNames(slot.exercise_id, slot.alternatives),
    optional: Boolean(slot.optional),
    scheme: formatSetScheme(sets, timed),
    workLabel: slot.plan_label ?? formatWorkLabel(sets, timed, assisted),
    warmupLabel: formatWarmupLabel(sets),
    restLabel: restSec != null ? formatRestLabel(restSec) : null,
    note: slot.note ?? null,
    timed,
    assisted,
    sets: sets.map((set, index) => ({
      setNumber: index + 1,
      label: set.part_label ?? setDisplayLabel(sets, index),
      weight_kg: set.weight_kg,
      reps: set.reps,
      rpe: set.rpe,
      ...(set.rpe_label ? { rpe_label: set.rpe_label } : {}),
      ...(set.part_label ? { part_label: set.part_label } : {}),
      ...(set.weight_label ? { weight_label: set.weight_label } : {}),
      amrap: Boolean(set.amrap),
      rest_sec: set.rest_sec,
      warmup: isWarmupSet(set),
    })),
  };
}

/**
 * Read-only upcoming preview: week-aware template + prior-log Last: lines.
 * Uses the same Block A T1 overlay as `createDraftSession` so Start matches Preview.
 * Uses `lastMatchingPerformance` (same-day family, Week 1 → Week 2, `date < asOf`).
 * Does not call `createDraftSession` or write IndexedDB.
 */
export function plannedDayPreview(
  template: DayTemplate,
  logs: readonly SessionLog[] = [],
  asOf: string,
): PlannedLiftPreview[] {
  const resolved = applyProgramWeek(template, asOf, { logs, hold: true });
  return resolved.slots.map((slot) => {
    const last =
      slot.volumeKind === 'backoff'
        ? null
        : lastMatchingPerformance(logs, slot.exercise_id, resolved.id, asOf);
    return {
      ...plannedLiftSummary(slot),
      exercise_id: slot.exercise_id,
      last,
      lastLine: formatLastPerformance(last),
    };
  });
}

/** Home restore card: T1 Last: missing, even if Session log (1) exists. */
export function shouldOfferHomeWeek1Restore(
  preview: readonly Pick<PlannedLiftPreview, 'role' | 'last'>[],
): boolean {
  const t1 = preview.find((row) => row.role === 'T1');
  return t1 == null || t1.last == null;
}
