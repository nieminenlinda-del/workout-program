import { useEffect, useState } from 'react';
import { AppTabs } from '../components/AppTabs';
import { EstimateChart, type ChartPoint } from '../components/EstimateChart';
import type { SessionRepository } from '../db/repository';
import { isBodyweightEntry, type BodyweightEntry } from '../domain/bodyweight';
import {
  COMPETITION_LIFTS,
  LIFT_LABEL,
  TEST_BACKUP_DATE,
  attemptMarksFor,
  dashboardPhaseLabel,
  dashboardTimeline,
  daysUntil,
  formatDayMonth,
  hardSetsInWeek,
  latestSquatBar,
  painEntries,
  readinessForWeek,
  rollingTwoWeekBest,
  sameLoadSeries,
  sessionCompletion,
  testedKg,
  thisWeekTargets,
  type CompetitionLift,
} from '../domain/dashboard';
import { calendarTemplateDay } from '../domain/templateDay';
import { mondayOnOrBefore } from '../domain/testWeek';
import { TEST_DAY } from '../types/phase2';
import type { SessionLog } from '../types/session';

function chartSpan(values: readonly number[], minPad: number): { yMin: number; yMax: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(minPad, (hi - lo) * 0.18);
  return { yMin: lo - pad, yMax: hi + pad };
}

function kg1(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

function axisLabel(ymd: string): string {
  return formatDayMonth(ymd);
}

export function DashboardScreen({
  repo,
  date,
  onToday,
  onLog,
}: {
  repo: SessionRepository;
  date: string;
  onToday: () => void;
  onLog: () => void;
}) {
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [weights, setWeights] = useState<BodyweightEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [weekInput, setWeekInput] = useState(() => mondayOnOrBefore(date));
  const [kgInput, setKgInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [logged, body] = await Promise.all([repo.listAllComplete(), repo.listBodyweight()]);
      if (cancelled) return;
      setSessions(logged);
      setWeights(body);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, revision]);

  const weekMonday = mondayOnOrBefore(date);
  const timeline = dashboardTimeline(date);
  const countdown = daysUntil(date, TEST_DAY);
  const targets = thisWeekTargets(date);
  const completion = sessionCompletion(sessions, weekMonday);
  const hard = hardSetsInWeek(sessions, weekMonday);
  const readiness = readinessForWeek(sessions, weekMonday, date);
  const sameLoad = sameLoadSeries(sessions);
  const pain = painEntries(sessions);
  const bar = latestSquatBar(sessions);
  const todayLetter = calendarTemplateDay(date);
  const hardTotal = hard.squat + hard.bench + hard.deadlift;
  const latestWeight = weights.at(-1);
  const draftEntry = { week: mondayOnOrBefore(weekInput), kg: Number(kgInput.replace(',', '.')) };
  const canSave = isBodyweightEntry(draftEntry);

  const saveWeek = () => {
    if (!canSave) return;
    void repo.saveBodyweight(draftEntry).then(() => {
      setKgInput('');
      setRevision((value) => value + 1);
    });
  };

  const removeWeek = (week: string) => {
    void repo.replaceBodyweight(weights.filter((row) => row.week !== week)).then(() => {
      setRevision((value) => value + 1);
    });
  };

  return (
    <main className="screen" data-screen="dashboard">
      <header className="hero">
        <p className="brand">Linda Lift</p>
        <div className="dash-hero">
          <h1>Dashboard</h1>
          <div className="dash-count">
            <strong>{countdown}</strong>
            <p className="muted">days to {formatDayMonth(TEST_DAY)}</p>
          </div>
        </div>
        <p className="phase-chip">{dashboardPhaseLabel(date)}</p>
      </header>

      <AppTabs current="dashboard" onToday={onToday} onDashboard={() => undefined} onLog={onLog} />

      {!ready ? <p className="muted">Loading the log…</p> : null}

      <section className="card" id="dash-plan">
        <p className="kicker">Plan</p>
        <h2>Through the test</h2>
        <p className="lede">
          Weeks start Monday. Block A is finished. The backup Saturday and the December meets sit on this plan.
        </p>
        <ol className="dash-weeks">
          {timeline.map((week) => (
            <li key={week.id} className="dash-week">
              <div className="dash-week-id">{week.id}</div>
              <div>
                <div className="dash-week-top">
                  <span>{week.title}</span>
                  <span className={`dash-tag ${week.badgeKind}`}>{week.badge}</span>
                </div>
                {week.days ? (
                  <div className="dash-days" aria-label={`Week of ${week.title}`}>
                    {week.days.map((day) => (
                      <div key={day.label + day.date} className={`dash-day ${day.kind}`}>
                        <b>{day.label}</b>
                        <span>{day.date}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {week.lines.map((line) => (
                  <p key={line} className="dash-sub">
                    {line}
                  </p>
                ))}
                {week.note ? <p className="dash-note">{week.note}</p> : null}
                {week.days ? (
                  <p className="dash-note">Filled days are training. Quiet days are rest.</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="dash-note">Backup date {formatDayMonth(TEST_BACKUP_DATE)} stays off the training week.</p>
      </section>

      <section className="card" id="dash-e1rm">
        <p className="kicker">Estimated 1RM</p>
        <h2>Rolling two-week best</h2>
        <p className="lede">
          Top sets only. RTS when RPE is 6–10 and reps are 1–5. Epley only if a short set has no RPE. Back-offs,
          warmups, AMRAPs over 5, paused deadlift, close-grip, and high-bar stay off this line.
        </p>
        {COMPETITION_LIFTS.map((lift) => (
          <EstimateCard key={lift} lift={lift} sessions={sessions} />
        ))}
      </section>

      <section className="card dash-today" id="dash-week">
        <p className="kicker">This week</p>
        <h2>Targets</h2>
        {targets.length === 0 ? (
          <p className="dash-empty">No training days left in this week.</p>
        ) : (
          <ul className="dash-lifts">
            {targets.map((day) => (
              <li key={day.date}>
                <div className="dash-week-top">
                  <span className="muted">{day.heading}</span>
                  {day.date === date ? <span className="dash-tag current">Today</span> : null}
                </div>
                {day.lines.map((line) => (
                  <p key={line.name + line.load} className="dash-load">
                    <strong>{line.name}</strong> {line.load}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
        <p className="dash-note">Paused bench, paused deadlift, and close-grip stay off the estimated 1RM line.</p>
      </section>

      <section className="card" id="dash-metrics">
        <p className="kicker">This week</p>
        <h2>Hard sets</h2>
        <p className="lede">RPE 7 and up. Back-offs count. Warmups stay out.</p>
        <div className="dash-metrics">
          {COMPETITION_LIFTS.map((lift) => (
            <div key={lift} className="dash-metric">
              <b>{LIFT_LABEL[lift]}</b>
              {hard[lift] > 0 ? (
                <div className="dash-pips" aria-hidden="true">
                  {Array.from({ length: Math.min(hard[lift], 12) }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
              ) : (
                <div className="dash-pips" />
              )}
              <span>{hard[lift]}</span>
            </div>
          ))}
        </div>
        {hardTotal === 0 ? <p className="dash-empty">No hard sets logged this week.</p> : null}

        <div className="dash-complete">
          <div>
            <p className="kicker">Sessions</p>
            <p className="dash-frac">
              {completion.done}/{completion.total}
            </p>
          </div>
          <div className="dash-quad" aria-label="Template days saved">
            {(['A', 'B', 'C', 'D'] as const).map((letter) => (
              <span
                key={letter}
                className={completion.days[letter] ? 'done' : todayLetter === letter ? 'now' : ''}
              >
                {letter}
              </span>
            ))}
          </div>
        </div>
        {completion.done === 0 ? <p className="dash-empty">No session saved this week.</p> : null}

        <div>
          <p className="kicker">Readiness</p>
          <div className="dash-lights" aria-label="Readiness by day">
            {readiness.map((day) => (
              <div
                key={day.date}
                className={`dash-light ${day.light ? day.light.toLowerCase() : ''} ${day.isToday ? 'today' : ''}`}
              >
                <i />
                <small>{day.weekday}</small>
              </div>
            ))}
          </div>
          {readiness.every((day) => day.light == null) ? (
            <p className="dash-empty">Readiness shows up after a session is saved.</p>
          ) : null}
        </div>

        <div>
          <p className="kicker">Same load</p>
          {sameLoad && sameLoad.points.length > 0 ? (
            <>
              <div className="dash-chart-head">
                <h2>
                  {LIFT_LABEL[sameLoad.lift]} @ {sameLoad.weight_kg}
                </h2>
              </div>
              <EstimateChart
                ariaLabel={`${LIFT_LABEL[sameLoad.lift]} top-set RPE at ${sameLoad.weight_kg} kg`}
                height={120}
                points={sameLoad.points.map((point) => ({
                  label: axisLabel(point.date),
                  value: point.rpe,
                }))}
                yMin={5.5}
                yMax={10.5}
                ticks={[6, 8, 10]}
              />
            </>
          ) : (
            <p className="dash-empty">No repeated top-set weight yet.</p>
          )}
        </div>
      </section>

      <section className="card" id="dash-bodyweight">
        <p className="kicker">Bodyweight</p>
        <div className="dash-chart-head">
          <h2>Weekly</h2>
          {latestWeight ? (
            <div>
              <span className="dash-now">{kg1(latestWeight.kg)}</span> <span className="muted">kg</span>
            </div>
          ) : null}
        </div>
        {latestWeight ? <p className="muted">Week of {formatDayMonth(latestWeight.week)}</p> : null}
        {weights.length > 0 ? (
          <EstimateChart
            ariaLabel="Weekly bodyweight"
            points={weights.map((row) => ({ label: axisLabel(row.week), value: row.kg }))}
            {...bodyScale(weights)}
            stroke="#f4f0e6"
          />
        ) : (
          <p className="dash-empty">No weekly weigh-in yet.</p>
        )}
        <p className="dash-note">One number for the week. No goal line.</p>
        {weights.length > 0 ? (
          <ul className="dash-bw-list">
            {weights.map((row) => (
              <li key={row.week}>
                <span>
                  {formatDayMonth(row.week)} · {kg1(row.kg)} kg
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-slim"
                  onClick={() => removeWeek(row.week)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="dash-bw-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveWeek();
          }}
        >
          <label>
            Week
            <input
              type="date"
              value={weekInput}
              onChange={(event) => {
                const value = event.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setWeekInput(mondayOnOrBefore(value));
              }}
            />
          </label>
          <label>
            kg
            <input
              inputMode="decimal"
              value={kgInput}
              placeholder="kg"
              onChange={(event) => setKgInput(event.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-slim" disabled={!canSave}>
            Save
          </button>
        </form>
      </section>

      <section className="card" id="dash-pain">
        <p className="kicker">Pain</p>
        <h2>By area</h2>
        {pain.length === 0 ? (
          <p className="dash-empty">No pain area logged.</p>
        ) : (
          <ul className="dash-pain-list">
            {pain.map((entry) => (
              <li key={entry.date + entry.area} className={`dash-pain ${entry.area}`}>
                <i />
                <div>
                  <div className="dash-week-top">
                    <span>{entry.label}</span>
                    <span className="muted">{formatDayMonth(entry.date)}</span>
                  </div>
                  {entry.note ? <p className="dash-note">{entry.note}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" id="dash-squat">
        <p className="kicker">Squat</p>
        <h2>{bar?.position === 'high_bar' ? 'High-bar' : 'Low-bar'}</h2>
        <p className="dash-note">
          {bar
            ? `Latest squat on ${formatDayMonth(bar.date)}.`
            : 'No squat logged yet. New sessions start on low-bar.'}
        </p>
      </section>
    </main>
  );
}

function bodyScale(weights: readonly BodyweightEntry[]): {
  yMin: number;
  yMax: number;
  ticks: number[];
} {
  const span = chartSpan(
    weights.map((row) => row.kg),
    0.4,
  );
  const ticks: number[] = [];
  for (let tick = Math.ceil(span.yMin); tick <= Math.floor(span.yMax); tick += 1) ticks.push(tick);
  return { ...span, ticks };
}

function EstimateCard({ lift, sessions }: { lift: CompetitionLift; sessions: readonly SessionLog[] }) {
  const marks = attemptMarksFor(lift);
  const tested = testedKg(lift);
  const series = rollingTwoWeekBest(sessions, lift);
  const latest = series.at(-1);
  const span = chartSpan(
    [marks.opener, marks.goalLow, marks.goalHigh, tested, ...series.map((point) => point.estimate)],
    2,
  );
  const ticks = [marks.opener, tested, marks.goalHigh].filter(
    (tick, index, all) => all.indexOf(tick) === index,
  );
  const points: ChartPoint[] = series.map((point) => ({
    label: axisLabel(point.week),
    value: point.estimate,
  }));
  return (
    <article>
      <div className="dash-chart-head">
        <h2>{LIFT_LABEL[lift]}</h2>
        {latest ? (
          <div>
            <span className="dash-now">{kg1(latest.estimate)}</span> <span className="muted">kg est.</span>
          </div>
        ) : (
          <p className="dash-empty">No top sets yet.</p>
        )}
      </div>
      <EstimateChart
        ariaLabel={`${LIFT_LABEL[lift]} estimated 1RM`}
        points={points}
        yMin={span.yMin}
        yMax={span.yMax}
        ticks={ticks}
        references={{
          goalLow: marks.goalLow,
          goalHigh: marks.goalHigh,
          tested,
          opener: marks.opener,
        }}
      />
      <p className="dash-note">
        Tested {kg1(tested)} · opener {kg1(marks.opener)} · goal {kg1(marks.goalLow)}–{kg1(marks.goalHigh)}
      </p>
    </article>
  );
}
