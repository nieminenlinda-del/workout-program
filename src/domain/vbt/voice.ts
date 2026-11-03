const COUNT_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

export const SPEED_DROP_CALLOUT = 'speed drop, rack it';
export const LAST_REP_CALLOUT = 'last rep';

/** English phrase for one completed rep. Empty when there is nothing new to say. */
export function repPhrase(rep: number, targetReps: number | null, speedDrop: boolean): string {
  const count = COUNT_WORDS[rep] ?? String(rep);
  const parts = [count];
  if (targetReps != null && rep === targetReps) parts.push(LAST_REP_CALLOUT);
  if (speedDrop) parts.push(SPEED_DROP_CALLOUT);
  return parts.join('. ');
}
