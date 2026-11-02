import { C1_RETURN_RULE } from '../domain/c1ReturnWeek';
import { TEST_DAY_NOTES } from '../domain/cyclePlan';
import { isC1ReturnWeek, isRecoveryWeek } from '../domain/programWeek';
import { recoveryNoteLines } from '../domain/recoveryWeek';
import { TEST_DAY } from '../types/phase2';
import type { CanonicalTemplateDay } from '../types/session';

/**
 * Recovery week, the C1 return rule, or the bench-only test note.
 * Hidden on ordinary training days.
 */
export function RecoveryCallout({
  date,
  day,
}: {
  date: string;
  day: CanonicalTemplateDay;
}) {
  const lines = noteLines(date, day);
  if (lines.length === 0) return null;
  return (
    <div className="recovery-callout">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function noteLines(date: string, day: CanonicalTemplateDay): string[] {
  if (isRecoveryWeek(date)) return recoveryNoteLines(day);
  if (isC1ReturnWeek(date)) return [C1_RETURN_RULE];
  if (date.slice(0, 10) === TEST_DAY) return [...TEST_DAY_NOTES];
  return [];
}
