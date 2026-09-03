import type { ReadinessKey } from '../domain/readiness';
import { READINESS_HINTS, READINESS_LABELS } from '../domain/readiness';

export function ScorePicker({
  field,
  value,
  onChange,
}: {
  field: ReadinessKey;
  value: number;
  onChange: (n: number) => void;
}) {
  const hint = READINESS_HINTS[field];
  return (
    <div className="score-picker">
      <div className="score-head">
        <strong>{READINESS_LABELS[field]}</strong>
        <span className="score-value">{value}</span>
      </div>
      <div className="score-hints">
        <span>{hint.low}</span>
        <span>{hint.high}</span>
      </div>
      <div className="score-row" role="radiogroup" aria-label={READINESS_LABELS[field]}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            className={`score-btn ${value === n ? 'selected' : ''} ${n >= 8 ? 'hot' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
