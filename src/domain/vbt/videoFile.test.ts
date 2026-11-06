import { describe, expect, it } from 'vitest';
import { countVerticalReps } from './reps';
import { ramp } from './reps';
import { toVbtSetLog } from './log';
import { summarizeSet } from './velocity';
import { detectReps } from './reps';
import { fileTypeForRecorderMime, mediaRecorderTimeslice, videoExtForMime, vbtVideoFilename } from './videoFile';

describe('front and back rep count', () => {
  it('counts the rises in a synthetic front-view signal and stores no speed', () => {
    const samples = [
      ...ramp(0, 900, 1.0, 0.4),
      ...ramp(900, 1700, 0.4, 1.0),
      ...ramp(1700, 2600, 1.0, 0.4),
      ...ramp(2600, 3400, 0.4, 1.0),
      ...ramp(3400, 4300, 1.0, 0.4),
      ...ramp(4300, 5100, 0.4, 1.0),
    ];
    expect(countVerticalReps(samples, 'squat')).toBe(3);
    const summary = summarizeSet(detectReps(samples, { kind: 'squat' }), 20);
    const stored = toVbtSetLog(2, summary, 60, 'front');
    expect(stored.view).toBe('front');
    expect(stored.rep_count).toBe(3);
    expect(stored.best_velocity_m_s).toBeUndefined();
    expect(stored.velocity_loss_pct).toBeUndefined();
    expect(stored.reps.every((rep) => rep.mean_velocity_m_s == null && rep.rom_cm == null)).toBe(true);
    expect(stored.reps.map((rep) => rep.rep)).toEqual([1, 2, 3]);
  });
});

describe('video filename', () => {
  it('builds the phone file name and picks mp4 only for an mp4 mime', () => {
    expect(vbtVideoFilename('2026-11-03', 'Bench press', 40, 2, 'mp4')).toBe(
      'linda-lift_2026-11-03_bench-press_40kg_set2.mp4',
    );
    expect(vbtVideoFilename('2026-11-03T09:00:00', 'Deadlift', 92.5, 1, 'webm')).toBe(
      'linda-lift_2026-11-03_deadlift_92.5kg_set1.webm',
    );
    expect(videoExtForMime('video/mp4')).toBe('mp4');
    expect(videoExtForMime('video/webm;codecs=vp8')).toBe('webm');
    expect(mediaRecorderTimeslice('video/mp4')).toBeNull();
    expect(mediaRecorderTimeslice('video/webm;codecs=vp8')).toBe(200);
    expect(fileTypeForRecorderMime('video/mp4;codecs=avc1')).toBe('video/mp4');
  });
});
