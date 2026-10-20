import { useId } from 'react';
import { PAIN_AREA_LABELS, type PainArea, type SessionDraft } from '../types/session';

export function PainFields({
  draft,
  suggested = false,
  onChange,
}: {
  draft: SessionDraft;
  suggested?: boolean;
  onChange: (next: SessionDraft) => void;
}) {
  const noteId = useId();
  const stamp = (patch: Partial<SessionDraft>) =>
    onChange({ ...draft, ...patch, updated_at: new Date().toISOString() });

  const chooseArea = (area: PainArea) => {
    if (draft.pain_area === area) {
      const next: SessionDraft = { ...draft, updated_at: new Date().toISOString() };
      delete next.pain_area;
      onChange(next);
      return;
    }
    stamp({ pain_area: area });
  };

  return (
    <section className="card pain-card" data-field="pain-area">
      <p className="kicker">Pain</p>
      <button
        type="button"
        className={`toggle ${draft.pain_flag ? 'on' : ''}`}
        onClick={() => stamp({ pain_flag: !draft.pain_flag })}
      >
        Pain flag{suggested && !draft.pain_flag ? ' · suggested' : ''}
      </button>
      <div className="alt-row" role="group" aria-label="Pain area">
        {(Object.keys(PAIN_AREA_LABELS) as PainArea[]).map((area) => (
          <button
            key={area}
            type="button"
            className={`chip ${draft.pain_area === area ? 'selected' : ''}`}
            onClick={() => chooseArea(area)}
          >
            {PAIN_AREA_LABELS[area]}
          </button>
        ))}
      </div>
      <label className="pain-note-label" htmlFor={noteId}>
        Short note
      </label>
      <input
        id={noteId}
        className="pain-note-input"
        type="text"
        maxLength={80}
        placeholder="Optional, a few words"
        value={draft.pain_note ?? ''}
        onChange={(event) => stamp({ pain_note: event.target.value })}
      />
    </section>
  );
}
