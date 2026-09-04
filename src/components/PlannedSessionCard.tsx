import { useState } from 'react';
import { TemplatePicker } from './TemplatePicker';
import { WorkoutPreview } from './WorkoutPreview';
import { DAY_TEMPLATES } from '../data/templates';
import type { CanonicalTemplateDay, SessionDraft } from '../types/session';

export function PlannedSessionCard({
  templateDay,
  onTemplateDay,
  draft,
  onStart,
}: {
  templateDay: CanonicalTemplateDay;
  onTemplateDay: (day: CanonicalTemplateDay) => void;
  draft: SessionDraft | null;
  onStart: () => void;
}) {
  const template = DAY_TEMPLATES[templateDay];
  const [browsing, setBrowsing] = useState(false);

  return (
    <section className="card planned-session-card">
      <p className="kicker">Template day</p>
      <TemplatePicker value={templateDay} onChange={onTemplateDay} />
      <h2 className="template-heading">{template.title}</h2>
      <p className="muted">{template.focus}</p>

      <WorkoutPreview template={template} expandAll={browsing} />

      <p className="preview-note">
        {browsing
          ? 'Browse only — does not start a session or timers.'
          : 'Open a lift or Preview to see planned sets. Start is separate.'}
      </p>

      <button
        type="button"
        className="btn btn-ghost btn-block"
        aria-expanded={browsing}
        aria-controls="planned-session-preview"
        onClick={() => setBrowsing((open) => !open)}
      >
        {browsing ? 'Hide preview' : 'Preview session'}
      </button>

      <button type="button" className="btn btn-primary btn-block" onClick={onStart}>
        {draft ? 'Replace draft & start' : 'Start session'}
      </button>
    </section>
  );
}
