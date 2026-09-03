import { NumberStepper } from '../components/NumberStepper';
import { displaySeconds, formatClock, progressRatio } from '../domain/countdown';
import { DEFAULT_INTERVAL_CONFIG } from '../domain/intervalTimer';
import { useIntervalTimer } from '../hooks/useIntervalTimer';

export function IntervalTimerScreen({ onBack }: { onBack: () => void }) {
  const { config, setConfig, state, start, pause, resume, extend, skipPhase, stop } =
    useIntervalTimer(DEFAULT_INTERVAL_CONFIG);
  const remaining = displaySeconds(state.countdown);
  const pct = progressRatio(state.countdown);
  const circumference = 2 * Math.PI * 52;
  const running = state.phase === 'work' || state.phase === 'rest';
  const phaseLabel =
    state.phase === 'work' ? 'Work' : state.phase === 'rest' ? 'Rest' : state.phase === 'done' ? 'Done' : 'Ready';

  return (
    <main className="screen">
      <header className="topbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Today
        </button>
        <h1>Intervals</h1>
        <span />
      </header>
      <p className="lede">
        Conditioning / circuits. Not tied to a lift. Cues buzz even if the phone is muted.
      </p>

      {state.phase === 'idle' ? (
        <section className="card">
          <p className="kicker">Setup</p>
          <NumberStepper
            label="Rounds"
            value={config.rounds}
            onChange={(rounds) => setConfig({ ...config, rounds })}
            step={1}
            min={1}
            max={40}
            suffix="rounds"
          />
          <NumberStepper
            label="Work"
            value={config.workSec}
            onChange={(workSec) => setConfig({ ...config, workSec })}
            step={5}
            min={5}
            max={600}
            suffix="sec"
          />
          <NumberStepper
            label="Rest"
            value={config.restSec}
            onChange={(restSec) => setConfig({ ...config, restSec })}
            step={5}
            min={0}
            max={600}
            suffix="sec"
          />
          <button type="button" className="btn btn-primary btn-block" onClick={start}>
            Start {config.rounds} × {config.workSec}/{config.restSec}
          </button>
        </section>
      ) : null}

      {running ? (
        <section className={`card interval-card phase-${state.phase}`}>
          <p className="kicker">
            Round {state.round} / {state.config.rounds}
          </p>
          <h2 className={`interval-phase phase-${state.phase}`}>{phaseLabel}</h2>
          <div className="rest-ring-wrap">
            <svg className="rest-ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="52" className="rest-ring-bg" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className={`rest-ring-fg ring-${state.phase}`}
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${circumference * (1 - pct)}`}
              />
            </svg>
            <div className="rest-time">{formatClock(remaining)}</div>
          </div>
          <p className="muted">
            {state.countdown.running ? 'Running' : 'Paused'} · {state.config.workSec}s work /{' '}
            {state.config.restSec}s rest
          </p>
          <div className="rest-extend">
            <button type="button" className="btn btn-ghost" onClick={() => extend(15)}>
              +15s
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => extend(30)}>
              +30s
            </button>
          </div>
          <div className="rest-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={state.countdown.running ? pause : resume}
            >
              {state.countdown.running ? 'Pause' : 'Resume'}
            </button>
            <button type="button" className="btn btn-primary" onClick={skipPhase}>
              Skip phase
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={stop}>
            Stop
          </button>
        </section>
      ) : null}

      {state.phase === 'done' ? (
        <section className="card interval-card phase-done">
          <p className="kicker">Finished</p>
          <h2 className="interval-phase">Done</h2>
          <p className="muted">
            {state.config.rounds} rounds · {state.config.workSec}/{state.config.restSec}
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={start}>
            Repeat
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={stop}>
            Edit setup
          </button>
        </section>
      ) : null}
    </main>
  );
}
