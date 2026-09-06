/** Additive `warmup` flag on SeedSet / LoggedSet. Missing means a work set. */
export function isWarmupSet(set: { warmup?: boolean } | undefined): boolean {
  return Boolean(set?.warmup);
}

export function workSets<T extends { warmup?: boolean }>(sets: readonly T[]): T[] {
  return sets.filter((set) => !isWarmupSet(set));
}

export function warmupSets<T extends { warmup?: boolean }>(sets: readonly T[]): T[] {
  return sets.filter((set) => isWarmupSet(set));
}

/** `W1` / `W2` for warmups, `1` / `2` for work sets (work numbering ignores warmups). */
export function setDisplayLabel(sets: readonly { warmup?: boolean }[], index: number): string {
  const set = sets[index];
  if (!set) return String(index + 1);
  if (isWarmupSet(set)) {
    return `W${sets.slice(0, index + 1).filter(isWarmupSet).length}`;
  }
  return String(sets.slice(0, index + 1).filter((s) => !isWarmupSet(s)).length);
}

export function laterSameKindUnlogged(
  sets: readonly { warmup?: boolean; completed?: boolean }[],
  index: number,
): boolean {
  const warmup = isWarmupSet(sets[index]);
  return sets.some((set, i) => i > index && isWarmupSet(set) === warmup && !set.completed);
}
