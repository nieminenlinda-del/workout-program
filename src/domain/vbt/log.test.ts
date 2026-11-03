import { describe, expect, it } from 'vitest';
import { buildSessionBackup, parseSessionBackupJson } from '../sessionBackup';
import { createDraftSession } from '../sessionFactory';
import { attachVbtSet } from './log';
import { detectReps, ramp } from './reps';
import { summarizeSet } from './velocity';

describe('saving a camera set', () => {
  it('stores velocities on the lift and leaves the training-max flag alone', () => {
    const draft = createDraftSession('B', '2026-11-03');
    expect(draft.counts_toward_tm).toBe(false);
    const bench = draft.lifts.findIndex((lift) => lift.exercise_id === 'bench_regular');
    const setIndex = draft.lifts[bench]?.sets.findIndex((set) => !set.warmup) ?? 0;
    const samples = [
      ...ramp(0, 700, 0.55, 0.27),
      ...ramp(700, 1400, 0.27, 0.55),
      ...ramp(1400, 2100, 0.55, 0.27),
      ...ramp(2100, 3000, 0.27, 0.55),
    ];
    const summary = summarizeSet(detectReps(samples, { kind: 'bench' }), 20);
    expect(summary.rep_count).toBe(2);
    const next = attachVbtSet(draft, bench, setIndex, summary, 42.5);
    expect(next.counts_toward_tm).toBe(false);
    expect(next.lifts[bench]?.vbt?.threshold_pct).toBe(20);
    expect(next.lifts[bench]?.vbt?.sets[0]).toMatchObject({
      set_index: setIndex,
      rep_count: 2,
      load_kg: 42.5,
    });
    expect(next.lifts[bench]?.sets[setIndex]?.completed).toBe(true);
    expect(next.lifts[bench]?.sets[setIndex]?.reps).toBe(2);
    expect(next.lifts[bench]?.sets[setIndex]?.weight_kg).toBe(
      draft.lifts[bench]?.sets[setIndex]?.weight_kg,
    );

    next.status = 'complete';
    const parsed = parseSessionBackupJson(JSON.stringify(buildSessionBackup([next])));
    expect(parsed.sessions[0]?.lifts[bench]?.vbt?.sets[0]?.rep_count).toBe(2);
    expect(parsed.sessions[0]?.counts_toward_tm).toBe(false);

    const bare = createDraftSession('B', '2026-10-06');
    bare.status = 'complete';
    const old = parseSessionBackupJson(JSON.stringify(buildSessionBackup([bare])));
    expect(old.sessions[0]?.lifts[0]?.vbt).toBeUndefined();
  });
});
