import { useEffect, useMemo, useState } from 'react';

function formatTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RestTimer({
  seconds,
  exerciseName,
  onDone,
}: {
  seconds: number;
  exerciseName: string;
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [target, setTarget] = useState(seconds);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  useEffect(() => {
    if (remaining === 0) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(200);
    }
  }, [remaining]);

  const pct = useMemo(() => (target <= 0 ? 1 : remaining / target), [remaining, target]);
  const done = remaining === 0;

  return (
    <div className="rest-overlay" role="dialog" aria-label="Rest timer">
      <div className="rest-card">
        <p className="rest-kicker">{done ? 'Rest done' : 'Rest'}</p>
        <h2 className="rest-title">{exerciseName}</h2>
        <div className="rest-ring-wrap">
          <svg className="rest-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className="rest-ring-bg" />
            <circle
              cx="60"
              cy="60"
              r="52"
              className="rest-ring-fg"
              strokeDasharray={`${2 * Math.PI * 52}`}
              strokeDashoffset={`${2 * Math.PI * 52 * (1 - pct)}`}
            />
          </svg>
          <div className="rest-time">{done ? 'GO' : formatTime(remaining)}</div>
        </div>
        <div className="rest-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRemaining((r) => r + 30);
              setTarget((t) => t + 30);
            }}
          >
            +30s
          </button>
          <button type="button" className="btn btn-primary" onClick={onDone}>
            {done ? 'Next set' : 'Skip rest'}
          </button>
        </div>
      </div>
    </div>
  );
}
