/**
 * Canonical exercise IDs for Linda Lift.
 * Primaries exclude sumo, high-bar, and close-grip as programmed lifts.
 */
export const PRIMARY_EXERCISE_IDS = [
  'squat_low_bar',
  'bench_regular',
  'deadlift_conventional',
  'bench_regular_volume',
] as const;

export const SUB_EXERCISE_IDS = [
  'squat_low_bar_box',
  'squat_low_bar_tempo',
  'squat_goblet',
  'bench_floor_regular',
  'push_up',
  'deadlift_rdl',
  'rdl_single_leg',
] as const;

export const ACCESSORY_EXERCISE_IDS = [
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
] as const;

export const EXERCISE_IDS = [
  ...PRIMARY_EXERCISE_IDS,
  ...SUB_EXERCISE_IDS,
  ...ACCESSORY_EXERCISE_IDS,
] as const;

export type PrimaryExerciseId = (typeof PRIMARY_EXERCISE_IDS)[number];
export type SubExerciseId = (typeof SUB_EXERCISE_IDS)[number];
export type AccessoryExerciseId = (typeof ACCESSORY_EXERCISE_IDS)[number];
export type ExerciseId = (typeof EXERCISE_IDS)[number];

export type ExerciseRole = 'primary' | 'sub' | 'accessory';

export type MovementPattern = 'squat' | 'bench' | 'hinge' | 'row' | 'press' | 'pull' | 'core' | 'arm';

/** Home-gym implements Linda can pick on accessory slots. */
export const EQUIPMENT_IDS = ['barbell', 'dumbbells', 'bands', 'bodyweight'] as const;
export type Equipment = (typeof EQUIPMENT_IDS)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbells: 'DBs',
  bands: 'Bands',
  bodyweight: 'BW',
};

export const EQUIPMENT_ARIA: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbells: 'Dumbbells',
  bands: 'Bands',
  bodyweight: 'Bodyweight',
};

export interface ExerciseMeta {
  id: ExerciseId;
  name: string;
  role: ExerciseRole;
  pattern: MovementPattern;
  style?: string;
  /** Hold duration is stored in `reps` (seconds), not a rep count. */
  timed?: boolean;
  /** How this catalog ID is typically loaded. Used to swap slot alternatives. */
  equipment: Equipment;
}

export const EXERCISE_CATALOG: Record<ExerciseId, ExerciseMeta> = {
  squat_low_bar: {
    id: 'squat_low_bar',
    name: 'Low-bar squat',
    role: 'primary',
    pattern: 'squat',
    style: 'low_bar',
    equipment: 'barbell',
  },
  bench_regular: {
    id: 'bench_regular',
    name: 'Bench press',
    role: 'primary',
    pattern: 'bench',
    style: 'regular',
    equipment: 'barbell',
  },
  deadlift_conventional: {
    id: 'deadlift_conventional',
    name: 'Conventional deadlift',
    role: 'primary',
    pattern: 'hinge',
    style: 'conventional',
    equipment: 'barbell',
  },
  bench_regular_volume: {
    id: 'bench_regular_volume',
    name: 'Bench press (volume)',
    role: 'primary',
    pattern: 'bench',
    style: 'regular',
    equipment: 'barbell',
  },
  squat_low_bar_box: {
    id: 'squat_low_bar_box',
    name: 'Low-bar box squat',
    role: 'sub',
    pattern: 'squat',
    style: 'low_bar',
    equipment: 'barbell',
  },
  squat_low_bar_tempo: {
    id: 'squat_low_bar_tempo',
    name: 'Low-bar tempo squat',
    role: 'sub',
    pattern: 'squat',
    style: 'low_bar',
    equipment: 'barbell',
  },
  squat_goblet: {
    id: 'squat_goblet',
    name: 'Goblet squat',
    role: 'sub',
    pattern: 'squat',
    equipment: 'dumbbells',
  },
  bench_floor_regular: {
    id: 'bench_floor_regular',
    name: 'Floor press',
    role: 'sub',
    pattern: 'bench',
    style: 'regular',
    equipment: 'barbell',
  },
  push_up: { id: 'push_up', name: 'Push-up', role: 'sub', pattern: 'bench', equipment: 'bodyweight' },
  deadlift_rdl: {
    id: 'deadlift_rdl',
    name: 'Romanian deadlift',
    role: 'sub',
    pattern: 'hinge',
    equipment: 'barbell',
  },
  rdl_single_leg: {
    id: 'rdl_single_leg',
    name: 'Single-leg RDL',
    role: 'sub',
    pattern: 'hinge',
    equipment: 'dumbbells',
  },
  rdl: { id: 'rdl', name: 'RDL', role: 'accessory', pattern: 'hinge', equipment: 'barbell' },
  good_morning_light: {
    id: 'good_morning_light',
    name: 'Good morning (light)',
    role: 'accessory',
    pattern: 'hinge',
    equipment: 'barbell',
  },
  goblet_squat: {
    id: 'goblet_squat',
    name: 'Goblet squat',
    role: 'accessory',
    pattern: 'squat',
    equipment: 'dumbbells',
  },
  front_squat_light: {
    id: 'front_squat_light',
    name: 'Front squat (light)',
    role: 'accessory',
    pattern: 'squat',
    equipment: 'barbell',
  },
  reverse_lunge: {
    id: 'reverse_lunge',
    name: 'Reverse lunge',
    role: 'accessory',
    pattern: 'squat',
    equipment: 'dumbbells',
  },
  split_squat_db: {
    id: 'split_squat_db',
    name: 'DB split squat',
    role: 'accessory',
    pattern: 'squat',
    equipment: 'dumbbells',
  },
  hip_thrust: {
    id: 'hip_thrust',
    name: 'Hip thrust',
    role: 'accessory',
    pattern: 'hinge',
    equipment: 'barbell',
  },
  glute_bridge: {
    id: 'glute_bridge',
    name: 'Glute bridge',
    role: 'accessory',
    pattern: 'hinge',
    equipment: 'bodyweight',
  },
  row_barbell: {
    id: 'row_barbell',
    name: 'Barbell row',
    role: 'accessory',
    pattern: 'row',
    equipment: 'barbell',
  },
  row_db: { id: 'row_db', name: 'DB row', role: 'accessory', pattern: 'row', equipment: 'dumbbells' },
  overhead_press: {
    id: 'overhead_press',
    name: 'Overhead press',
    role: 'accessory',
    pattern: 'press',
    equipment: 'barbell',
  },
  pull_up: { id: 'pull_up', name: 'Pull-up', role: 'accessory', pattern: 'pull', equipment: 'bodyweight' },
  pull_up_band: {
    id: 'pull_up_band',
    name: 'Band-assisted pull-up',
    role: 'accessory',
    pattern: 'pull',
    equipment: 'bands',
  },
  lat_pulldown_band: {
    id: 'lat_pulldown_band',
    name: 'Band lat pulldown',
    role: 'accessory',
    pattern: 'pull',
    equipment: 'bands',
  },
  face_pull_band: {
    id: 'face_pull_band',
    name: 'Band face pull',
    role: 'accessory',
    pattern: 'pull',
    equipment: 'bands',
  },
  band_pull_apart: {
    id: 'band_pull_apart',
    name: 'Band pull-apart',
    role: 'accessory',
    pattern: 'pull',
    equipment: 'bands',
  },
  y_raise: { id: 'y_raise', name: 'Y-raise', role: 'accessory', pattern: 'press', equipment: 'dumbbells' },
  plank: { id: 'plank', name: 'Plank', role: 'accessory', pattern: 'core', timed: true, equipment: 'bodyweight' },
  side_plank: {
    id: 'side_plank',
    name: 'Side plank',
    role: 'accessory',
    pattern: 'core',
    timed: true,
    equipment: 'bodyweight',
  },
  dead_bug: { id: 'dead_bug', name: 'Dead bug', role: 'accessory', pattern: 'core', equipment: 'bodyweight' },
  curl_db: { id: 'curl_db', name: 'DB curl', role: 'accessory', pattern: 'arm', equipment: 'dumbbells' },
  tricep_pushdown_band: {
    id: 'tricep_pushdown_band',
    name: 'Band tricep pushdown',
    role: 'accessory',
    pattern: 'arm',
    equipment: 'bands',
  },
};

export function isExerciseId(value: string): value is ExerciseId {
  return (EXERCISE_IDS as readonly string[]).includes(value);
}

/** Strength work stays at 50; timed holds (plank) must accept 60s+. */
export const REPS_LOG_MAX = 50;
export const HOLD_SEC_LOG_MAX = 300;

export function isTimedHold(exerciseId: ExerciseId): boolean {
  return Boolean(EXERCISE_CATALOG[exerciseId]?.timed);
}

export function logCountMax(exerciseId: ExerciseId): number {
  return isTimedHold(exerciseId) ? HOLD_SEC_LOG_MAX : REPS_LOG_MAX;
}

export function exerciseEquipment(exerciseId: ExerciseId): Equipment {
  return EXERCISE_CATALOG[exerciseId].equipment;
}
