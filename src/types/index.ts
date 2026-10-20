export type { ExerciseId, ExerciseMeta, ExerciseRole, MovementPattern, Equipment } from './exercises';
export {
  ACCESSORY_EXERCISE_IDS,
  EQUIPMENT_IDS,
  EQUIPMENT_LABELS,
  EXERCISE_CATALOG,
  EXERCISE_IDS,
  PRIMARY_EXERCISE_IDS,
  SUB_EXERCISE_IDS,
  exerciseEquipment,
  isExerciseId,
} from './exercises';

export type {
  CanonicalTemplateDay,
  BarPosition,
  LoggedLift,
  LoggedSet,
  PainArea,
  Readiness,
  ReadinessLight,
  SessionDraft,
  SessionLog,
  TemplateDay,
} from './session';
export { DEFAULT_READINESS, PAIN_AREA_LABELS, isBarPosition, isPainArea } from './session';

export type {
  BlockPhase,
  HypertrophyProgressionHook,
  MesocycleBlock,
  MesocycleContext,
  MesocycleWindow,
  PowerComboProgressionRules,
  ProgramMode,
  ProgressionEngine,
  StrengthPeakProgressionHook,
  TestLift,
  TrainingMaxes,
  TrainingMode,
} from './phase2';
export {
  CURRENT_CYCLE,
  HYPERTROPHY_PROGRESSION_HOOK,
  MESOCYCLE_WINDOWS,
  PEAKING_PHASES,
  Phase2NotImplementedError,
  SEED_TRAINING_MAXES,
  TESTED_1RM,
  STRENGTH_PEAK_PROGRESSION_HOOK,
  TARGET_TEST_DATE,
  TEST_DAY,
  TEST_LIFT_ORDER,
  programModeFrom,
  progressionEngineStub,
  progressionRulesFor,
  trainingModeFrom,
} from './phase2';
