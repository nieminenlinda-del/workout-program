import type { DetectedRep } from './reps';
import { summarizeSet, type VbtSetSummary } from './velocity';

/** What Linda can change on the result card before the set is saved. */
export interface RepCorrection {
  /** Reps the camera detected. This list does not change. */
  detected: DetectedRep[];
  /** 1-based indexes from `detected` that she marked as false. */
  excluded: number[];
  /** Final count written to the set. May be higher than the kept camera reps. */
  repCount: number;
}

export function initialCorrection(detected: readonly DetectedRep[]): RepCorrection {
  return { detected: detected.slice(), excluded: [], repCount: detected.length };
}

export function keptReps(correction: RepCorrection): DetectedRep[] {
  const dropped = new Set(correction.excluded);
  return correction.detected.filter((rep) => !dropped.has(rep.rep));
}

/** Reps added with + past the camera. They have no bar speed. */
export function extraRepCount(correction: RepCorrection): number {
  return Math.max(0, correction.repCount - keptReps(correction).length);
}

export function changeRepCount(correction: RepCorrection, delta: number): RepCorrection {
  const nextCount = Math.max(0, correction.repCount + delta);
  const kept = keptReps(correction);
  if (nextCount >= kept.length) {
    return { ...correction, repCount: nextCount };
  }
  const dropFromEnd = kept.slice(nextCount).map((rep) => rep.rep);
  return {
    ...correction,
    repCount: nextCount,
    excluded: uniqueSorted([...correction.excluded, ...dropFromEnd]),
  };
}

export function toggleExcluded(correction: RepCorrection, repNumber: number): RepCorrection {
  if (!correction.detected.some((rep) => rep.rep === repNumber)) return correction;
  const excluded = correction.excluded.includes(repNumber);
  if (excluded) {
    return {
      ...correction,
      excluded: correction.excluded.filter((rep) => rep !== repNumber),
      repCount: correction.repCount + 1,
    };
  }
  return {
    ...correction,
    excluded: uniqueSorted([...correction.excluded, repNumber]),
    repCount: Math.max(0, correction.repCount - 1),
  };
}

/** Speed math uses only the reps she kept. The count can include extras. */
export function correctedSummary(correction: RepCorrection, thresholdPct: number): VbtSetSummary {
  const summary = summarizeSet(keptReps(correction), thresholdPct);
  return { ...summary, rep_count: correction.repCount };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
