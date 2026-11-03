import { useMemo, useState } from 'react';
import { loadsForLift, loadVelocityPoints, sameLoadSpeeds, VBT_LIFT_LABEL } from '../domain/vbt/history';
import type { VbtLiftKind } from '../domain/vbt/reps';
import { clampMinVelocity, readVbtSettings, writeVbtSettings, type VbtSettings } from '../domain/vbt/settings';
import { velocityEstimate } from '../domain/vbt/velocity';
import type { SessionLog } from '../types/session';

const KINDS: VbtLiftKind[] = ['squat', 'bench', 'deadlift'];

export function VbtSpeedCard({ sessions }: { sessions: readonly SessionLog[] }) {
  const [kind, setKind] = useState<VbtLiftKind>('bench');
  const [settings, setSettings] = useState<VbtSettings>(() => readVbtSettings());
  const loads = useMemo(() => loadsForLift(sessions, kind), [sessions, kind]);
  const [load, setLoad] = useState<number | null>(null);
  const selected = load != null && loads.includes(load) ? load : (loads[0] ?? null);
  const speeds = useMemo(
    () => (selected == null ? [] : sameLoadSpeeds(sessions, kind, selected)),
    [sessions, kind, selected],
  );
  const estimate = velocityEstimate(loadVelocityPoints(sessions, kind), settings.min_velocity_m_s[kind]);

  const changeMvt = (nextKind: VbtLiftKind, delta: number) => {
    const next = {
      min_velocity_m_s: {
        ...settings.min_velocity_m_s,
        [nextKind]: clampMinVelocity(settings.min_velocity_m_s[nextKind] + delta),
      },
    };
    setSettings(next);
    writeVbtSettings(next);
  };

  return (
    <section className="card" data-testid="vbt-history">
      <p className="kicker">Speed at one load</p>
      <h2>Best rep mean speed</h2>
      <p className="muted">Same lift and load over time. The number is the fastest rep’s mean speed.</p>
      <div className="vbt-row">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            className={`btn ${kind === item ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setKind(item)}
          >
            {VBT_LIFT_LABEL[item]}
          </button>
        ))}
      </div>
      {loads.length === 0 ? (
        <p className="muted">No side-view sets for {VBT_LIFT_LABEL[kind].toLowerCase()} yet.</p>
      ) : (
        <div className="vbt-row">
          {loads.map((kg) => (
            <button
              key={kg}
              type="button"
              className={`btn ${selected === kg ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setLoad(kg)}
            >
              {kg} kg
            </button>
          ))}
        </div>
      )}
      {speeds.length > 0 ? <SpeedChart points={speeds.map((row) => row.best_mean_m_s)} /> : null}
      {speeds.length > 0 ? (
        <ul className="vbt-rep-list">
          {speeds.map((row) => (
            <li key={`${row.date}-${row.session_id}`}>
              {row.date} · best {row.best_mean_m_s.toFixed(2)} m/s · first {row.first_mean_m_s.toFixed(2)} m/s
            </li>
          ))}
        </ul>
      ) : null}
      {estimate.status === 'ready' ? (
        <p className="vbt-estimate">
          Estimated 1RM {estimate.load_kg.toFixed(1)} kg from bar speed. Estimate only. Not a training max.
        </p>
      ) : (
        <p className="muted">Need more loads for an estimated max.</p>
      )}
      <p className="kicker">Minimum velocity</p>
      {KINDS.map((item) => (
        <div key={item} className="vbt-row">
          <span className="muted">{VBT_LIFT_LABEL[item]}</span>
          <button type="button" className="btn btn-ghost" onClick={() => changeMvt(item, -0.01)}>
            −
          </button>
          <strong>{settings.min_velocity_m_s[item].toFixed(2)} m/s</strong>
          <button type="button" className="btn btn-ghost" onClick={() => changeMvt(item, 0.01)}>
            +
          </button>
        </div>
      ))}
    </section>
  );
}

function SpeedChart({ points }: { points: readonly number[] }) {
  const width = 320;
  const height = 120;
  const min = Math.min(...points) - 0.05;
  const max = Math.max(...points) + 0.05;
  const span = Math.max(0.05, max - min);
  const coords = points
    .map((value, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * (width - 16) + 8;
      const y = height - ((value - min) / span) * (height - 16) - 8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="vbt-trace" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Best rep speed over time">
      <polyline points={coords} fill="none" stroke="#e8a04a" strokeWidth="3" />
    </svg>
  );
}
