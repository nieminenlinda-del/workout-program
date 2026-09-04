import { useState } from 'react';
import type { DayTemplate } from '../data/templates';
import { formatClock } from '../domain/countdown';
import { formatLoad, plannedLiftSummary } from '../domain/workoutPreview';

export function WorkoutPreview({ template }: { template: DayTemplate }) {
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const lifts = template.slots.map(plannedLiftSummary);

  return (
    <div className="workout-preview">
      <p className="kicker">Preview</p>
      <p className="muted preview-lede">
        Browse today’s plan. Start is a separate action — this does not log a session or start a
        timer.
      </p>
      <ol className="lift-preview">
        {lifts.map((lift) => {
          const expanded = openSlot === lift.slot_id;
          return (
            <li key={lift.slot_id} className={expanded ? 'preview-open' : undefined}>
              <button
                type="button"
                className="preview-lift"
                aria-expanded={expanded}
                onClick={() => setOpenSlot(expanded ? null : lift.slot_id)}
              >
                <span className={`role-tag role-${lift.role}`}>{lift.role}</span>
                <span className="preview-lift-copy">
                  <strong>{lift.name}</strong>
                  {lift.alternatives.length > 0 ? (
                    <em className="alt"> or {lift.alternatives.join(' / ')}</em>
                  ) : null}
                  {lift.optional ? <em className="alt"> (optional)</em> : null}
                  <span className="preview-scheme">
                    {lift.scheme}
                    {lift.restLabel ? ` · ${lift.restLabel}` : ''}
                  </span>
                </span>
                <span className="preview-toggle">{expanded ? 'Hide' : 'Open'}</span>
              </button>
              {expanded ? (
                <ol className="preview-sets">
                  {lift.sets.map((set) => (
                    <li key={set.setNumber} className="preview-set">
                      <span className="set-num">{set.setNumber}</span>
                      <span className="set-main">
                        {formatLoad(set.weight_kg)} × {set.reps}
                        {set.amrap ? '+' : ''}
                        <em> @ {set.rpe} RPE</em>
                      </span>
                      <span className="preview-rest">{formatClock(set.rest_sec)}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
