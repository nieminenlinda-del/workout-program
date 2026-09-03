import type { ReadinessLight, SessionDraft } from '../types/session';
import { READINESS_KEYS, shouldSuggestPainFlag, withComputedLight } from '../domain/readiness';
import { ScorePicker } from '../components/ScorePicker';
import { LightBadge } from '../components/LightBadge';

const LIGHTS: ReadinessLight[] = ['GREEN', 'YELLOW', 'RED'];

export function ReadinessScreen({
  draft,
  onChange,
  onBack,
  onContinue,
}: {
  draft: SessionDraft;
  onChange: (next: SessionDraft) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const r = draft.readiness;
  const suggested = shouldSuggestPainFlag(r);

  const patchScores = (key: (typeof READINESS_KEYS)[number], value: number) => {
    const scores = { ...r, [key]: value };
    const readiness = withComputedLight(scores);
    onChange({
      ...draft,
      readiness,
      pain_flag: readiness.pain >= 5 ? true : draft.pain_flag,
      updated_at: new Date().toISOString(),
    });
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <h1>Readiness</h1>
        <span />
      </header>

      <p className="lede">How you feel walking in. Light is auto, tap to override.</p>

      {READINESS_KEYS.map((key) => (
        <ScorePicker key={key} field={key} value={r[key]} onChange={(n) => patchScores(key, n)} />
      ))}

      <section className="card">
        <p className="kicker">Readiness light</p>
        <div className="light-row">
          {LIGHTS.map((light) => (
            <button
              key={light}
              type="button"
              className={`light-pick light-${light.toLowerCase()} ${r.light === light ? 'selected' : ''}`}
              onClick={() =>
                onChange({
                  ...draft,
                  readiness: { ...r, light },
                  updated_at: new Date().toISOString(),
                })
              }
            >
              <LightBadge light={light} />
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        className={`toggle ${draft.pain_flag ? 'on' : ''}`}
        onClick={() =>
          onChange({
            ...draft,
            pain_flag: !draft.pain_flag,
            updated_at: new Date().toISOString(),
          })
        }
      >
        Pain flag{suggested && !draft.pain_flag ? ' · suggested' : ''}
      </button>

      <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
        Today’s workout
      </button>
    </main>
  );
}
