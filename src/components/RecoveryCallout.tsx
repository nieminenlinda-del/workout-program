import { isRecoveryWeek } from '../domain/programWeek';
import { recoveryNoteLines } from '../domain/recoveryWeek';
import type { CanonicalTemplateDay } from '../types/session';

/** Rule, daily walk, and the Friday alternative. Hidden outside Block B week 4. */
export function RecoveryCallout({
  date,
  day,
}: {
  date: string;
  day: CanonicalTemplateDay;
}) {
  if (!isRecoveryWeek(date)) return null;
  return (
    <div className="recovery-callout">
      {recoveryNoteLines(day).map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
