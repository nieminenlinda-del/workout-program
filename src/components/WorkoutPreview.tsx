import { useState } from 'react';
import type { DayTemplate } from '../data/templates';
import { formatClock } from '../domain/countdown';
import {
  formatLoad,
  plannedSessionFromTemplate,
  type PlannedLift,
} from '../domain/plannedSession';

export function WorkoutPreview({
  template,
  expandAll = false,
}: {
  template: DayTemplate;
  /** When true, every lift’s set list is open (Preview browse). */
  expandAll?: boolean;
}) {
  const planned = plannedSessionFromTemplate(template);
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  return (
    <ol id="planned-session-preview" className="workout-preview" aria-label="Planned lifts">
      {planned.lifts.map((lift) => {
        const expanded = expandAll || openSlot === lift.slot_id;
        return (
          <li key={lift.slot_id} className={`preview-lift ${expanded ? 'open' : ''}`}>
            <button
              type="button"
              className="preview-lift-head"
              aria-expanded={expanded}
              onClick={() => setOpenSlot(expanded && !expandAll ? null : lift.slot_id)}
            >
              <span className={`role-tag role-${lift.role}`}>{lift.role}</span>
              <span className="preview-lift-copy">
                <strong>{lift.name}</strong>
                {lift.alternatives.length > 0 ? (
                  <em className="alt"> or {lift.alternatives.join(' / ')}</em>
                ) : null}
                {lift.optional ? <em className="alt"> (optional)</em> : null}
                <span className="preview-meta">
                  {lift.setsRepsLabel}
                  {lift.restLabel ? ` · rest ${lift.restLabel}` : ''}
                </span>
              </span>
              <span className="preview-chevron" aria-hidden>
                {expanded ? '▾' : '▸'}
              </span>
            </button>
            {expanded ? <PlannedSetList lift={lift} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function PlannedSetList({ lift }: { lift: PlannedLift }) {
  return (
    <ol className="preview-sets" aria-label={`${lift.name} planned sets`}>
      {lift.sets.map((set, index) => (
        <li key={index} className="preview-set">
          <span className="set-num">{index + 1}</span>
          <span className="set-main">
            {formatLoad(set.weight_kg)} × {set.reps}
            {set.amrap ? '+' : ''}
            <em> @ {set.rpe} RPE</em>
          </span>
          <span className="preview-rest">rest {formatClock(set.rest_sec)}</span>
        </li>
      ))}
    </ol>
  );
}
