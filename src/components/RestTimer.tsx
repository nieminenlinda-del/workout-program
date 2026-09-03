import { displaySeconds, formatClock, progressRatio } from '../domain/countdown';
import { unlockTimerAudio } from '../domain/timerCue';
import { useCountdown } from '../hooks/useCountdown';

export function RestTimer({
  seconds,
  exerciseName,
  onDone,
}: {
  seconds: number;
  exerciseName: string;
  onDone: () => void;
}) {
  const { state, pause, resume, extend, skip } = useCountdown(seconds);
  const remaining = displaySeconds(state);
  const done = state.finished;
  const pct = progressRatio(state);
  const circumference = 2 * Math.PI * 52;

  const finish = () => {
    unlockTimerAudio();
    onDone();
  };

  return (
    <div
      className="rest-overlay"
      role="dialog"
      aria-label="Rest timer"
      onClick={() => {
        skip();
        finish();
      }}
    >
      <div
        className="rest-card"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="rest-kicker">{done ? 'Rest done' : state.running ? 'Rest' : 'Paused'}</p>
        <h2 className="rest-title">{exerciseName}</h2>
        <p className="muted rest-hint">{seconds}s default · tap outside or skip to log</p>
        <div className="rest-ring-wrap">
          <svg className="rest-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className="rest-ring-bg" />
            <circle
              cx="60"
              cy="60"
              r="52"
              className="rest-ring-fg"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${circumference * (1 - pct)}`}
            />
          </svg>
          <div className="rest-time">{done ? 'GO' : formatClock(remaining)}</div>
        </div>
        <div className="rest-extend">
          <button type="button" className="btn btn-ghost" onClick={() => extend(15)}>
            +15s
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => extend(30)}>
            +30s
          </button>
        </div>
        <div className={`rest-actions ${done ? 'single' : ''}`}>
          {done ? (
            <button type="button" className="btn btn-primary btn-block" onClick={finish}>
              Next set
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={state.running ? pause : resume}
              >
                {state.running ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  skip();
                  finish();
                }}
              >
                Skip rest
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
