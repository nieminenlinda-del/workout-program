import { describe, expect, it } from 'vitest';
import { createDraftSession } from '../sessionFactory';
import { attachVbtSet } from './log';
import { detectReps, ramp } from './reps';
import { summarizeSet } from './velocity';
import { allSessionsVbtCsv, allVbtCsvFilename, sessionVbtCsv, VBT_CSV_HEADER } from './csv';

describe('bar-speed CSV', () => {
  it('writes one row per rep and skips a session with no camera data', () => {
    const empty = createDraftSession('B', '2026-11-03');
    expect(sessionVbtCsv(empty)).toBeNull();

    const bench = empty.lifts.findIndex((lift) => lift.exercise_id === 'bench_regular');
    const setIndex = empty.lifts[bench]?.sets.findIndex((set) => !set.warmup) ?? 0;
    const samples = [
      ...ramp(0, 600, 0.5, 0.25),
      ...ramp(600, 1200, 0.25, 0.5),
    ];
    const summary = summarizeSet(detectReps(samples, { kind: 'bench' }), 20);
    const saved = attachVbtSet(empty, bench, setIndex, summary, 40);
    const csv = sessionVbtCsv(saved);
    expect(csv).toBeTruthy();
    const rows = csv?.trim().split('\n') ?? [];
    expect(rows[0]).toBe(VBT_CSV_HEADER);
    expect(rows).toHaveLength(1 + summary.rep_count);
    expect(rows[1]).toContain('2026-11-03');
    expect(rows[1]).toContain(saved.session_id);
    expect(rows[1]).toContain('Bench press');
    expect(rows[1]).toContain(',40,');
    expect(rows[1]).toContain(`,${setIndex + 1},1,`);
    expect(rows[1]).toContain(`,${summary.velocity_loss_pct.toFixed(1)},${summary.rep_count}`);
  });

  it('quotes a lift name that contains a comma', () => {
    const draft = createDraftSession('A', '2026-11-02');
    const index = 0;
    const setIndex = draft.lifts[index]?.sets.findIndex((set) => !set.warmup) ?? 0;
    const summary = summarizeSet(
      detectReps(
        [...ramp(0, 800, 1, 0.4), ...ramp(800, 1600, 0.4, 1)],
        { kind: 'squat' },
      ),
      20,
    );
    const saved = attachVbtSet(draft, index, setIndex, summary, 45);
    const lift = saved.lifts[index];
    if (lift) lift.name = 'Squat, slow';
    const csv = sessionVbtCsv(saved) ?? '';
    expect(csv).toContain('"Squat, slow"');
  });

  it('exports every session in date order and skips sessions with no bar speed', () => {
    const older = benchSession('2026-11-01');
    const newer = benchSession('2026-11-03');
    const empty = createDraftSession('B', '2026-11-03');
    const csv = allSessionsVbtCsv([newer, empty, older]);
    expect(csv?.startsWith(`${VBT_CSV_HEADER}\n`)).toBe(true);
    const rows = csv?.trim().split('\n').slice(1) ?? [];
    expect(rows[0]).toContain('2026-11-01');
    expect(rows[0]).toContain(older.session_id);
    expect(rows.at(-1)).toContain('2026-11-03');
    expect(rows.at(-1)).toContain(newer.session_id);
    expect(csv).not.toContain(empty.session_id);
    expect(allSessionsVbtCsv([empty])).toBeNull();
    expect(allVbtCsvFilename('2026-11-03')).toBe('linda-lift_bar-speed_all_2026-11-03.csv');
  });

  it('leaves excluded reps out of the combined file', () => {
    const saved = benchSession('2026-11-03');
    const set = saved.lifts.find((lift) => lift.vbt)?.vbt?.sets[0];
    if (set?.reps[0]) set.excluded_reps = [set.reps[0].rep];
    const csv = allSessionsVbtCsv([saved]) ?? '';
    const reps = csv
      .trim()
      .split('\n')
      .slice(1)
      .map((row) => row.split(',')[5]);
    expect(reps).not.toContain(String(set?.reps[0]?.rep));
    expect(reps.length).toBe((set?.reps.length ?? 1) - 1);
  });
});

function benchSession(date: string) {
  const draft = createDraftSession('B', '2026-11-03');
  draft.date = date;
  const bench = draft.lifts.findIndex((lift) => lift.exercise_id === 'bench_regular');
  const setIndex = draft.lifts[bench]?.sets.findIndex((set) => !set.warmup) ?? 0;
  const summary = summarizeSet(
    detectReps([...ramp(0, 600, 0.5, 0.25), ...ramp(600, 1200, 0.25, 0.5)], { kind: 'bench' }),
    20,
  );
  return attachVbtSet(draft, bench, setIndex, summary, 42.5);
}
