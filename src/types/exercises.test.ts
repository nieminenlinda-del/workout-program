import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_EXERCISE_IDS,
  EXERCISE_CATALOG,
  EXERCISE_IDS,
  HOLD_SEC_LOG_MAX,
  PRIMARY_EXERCISE_IDS,
  REPS_LOG_MAX,
  SUB_EXERCISE_IDS,
  isTimedHold,
  logCountMax,
} from '../types/exercises';

const REQUIRED_PRIMARIES = [
  'squat_low_bar',
  'bench_regular',
  'deadlift_conventional',
  'bench_regular_volume',
];

const REQUIRED_SUBS = [
  'squat_low_bar_box',
  'squat_low_bar_tempo',
  'squat_goblet',
  'bench_floor_regular',
  'push_up',
  'deadlift_rdl',
  'rdl_single_leg',
];

const REQUIRED_ACCESSORIES = [
  'rdl',
  'good_morning_light',
  'goblet_squat',
  'front_squat_light',
  'reverse_lunge',
  'split_squat_db',
  'hip_thrust',
  'glute_bridge',
  'row_barbell',
  'row_db',
  'overhead_press',
  'pull_up',
  'pull_up_band',
  'lat_pulldown_band',
  'face_pull_band',
  'band_pull_apart',
  'y_raise',
  'plank',
  'side_plank',
  'dead_bug',
  'curl_db',
  'tricep_pushdown_band',
];

describe('exercise catalog', () => {
  it('includes every required snake_case id', () => {
    expect([...PRIMARY_EXERCISE_IDS]).toEqual(REQUIRED_PRIMARIES);
    expect([...SUB_EXERCISE_IDS]).toEqual(REQUIRED_SUBS);
    expect([...ACCESSORY_EXERCISE_IDS]).toEqual(REQUIRED_ACCESSORIES);
  });

  it('has catalog metadata for every id', () => {
    for (const id of EXERCISE_IDS) {
      expect(EXERCISE_CATALOG[id].id).toBe(id);
      expect(EXERCISE_CATALOG[id].name.length).toBeGreaterThan(1);
      expect(EXERCISE_CATALOG[id].equipment).toMatch(/^(barbell|dumbbells|bands|bodyweight)$/);
    }
  });

  it('does not program sumo, high-bar, or close-grip primaries', () => {
    const banned = ['sumo', 'high_bar', 'close_grip'];
    for (const id of PRIMARY_EXERCISE_IDS) {
      for (const token of banned) {
        expect(id.includes(token)).toBe(false);
      }
    }
  });

  it('treats plank holds as timed seconds, not a 50-rep cap', () => {
    expect(isTimedHold('plank')).toBe(true);
    expect(isTimedHold('side_plank')).toBe(true);
    expect(isTimedHold('dead_bug')).toBe(false);
    expect(isTimedHold('squat_low_bar')).toBe(false);
    expect(logCountMax('plank')).toBeGreaterThanOrEqual(60);
    expect(logCountMax('plank')).toBe(HOLD_SEC_LOG_MAX);
    expect(logCountMax('squat_low_bar')).toBe(REPS_LOG_MAX);
    expect(REPS_LOG_MAX).toBe(50);
    expect(HOLD_SEC_LOG_MAX).toBe(300);
  });
});
