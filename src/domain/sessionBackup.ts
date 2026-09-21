import { isExerciseId } from '../types/exercises';
import { DEFAULT_BAR_KG } from './equipment';
import {
  DEFAULT_READINESS,
  type CanonicalTemplateDay,
  type LoggedLift,
  type LoggedSet,
  type Readiness,
  type ReadinessLight,
  type SessionDraft,
  type SessionLog,
  type TemplateDay,
} from '../types/session';
import type { SessionRepository } from '../db/repository';
import { createDraftSession } from './sessionFactory';
import { isWarmupSet } from './sets';
import { withComputedLight } from './readiness';
import { canonicalTemplateDay } from './templateDay';
import { calendarYmd } from './lastPerformance';

export const BACKUP_SCHEMA = 'linda-lift-sessions';
export const BACKUP_SCHEMA_VERSION = 1;

export type ImportMode = 'merge' | 'replace';

export const WEEK1_REFERENCE_NOTES =
  'Week 1 Last: reference (recovery). T1s known: squat 47.5×3×5, bench 40×3×5, DL 70×3×5, Fri bench 40×2×5. Accessories are template placeholders — not gym-logged numbers.';

export const WEEK1_REFERENCE_DAYS: readonly { day: CanonicalTemplateDay; date: string }[] = [
  { day: 'A', date: '2026-09-07' },
  { day: 'B', date: '2026-09-08' },
  { day: 'C', date: '2026-09-10' },
  { day: 'D', date: '2026-09-11' },
];

/** Reconstructed Mon 14 Sep 2026 Day A after a wiped home-screen IndexedDB. */
export const MON14_DAY_A_DATE = '2026-09-14';
export const MON14_DAY_A_SESSION_ID = 'linda-lift-seed-2026-09-14-A';
export const MON14_DAY_A_SQUAT_KG = 57.5;
export const MON14_DAY_A_SQUAT_REPS = 4;
export const MON14_DAY_A_SQUAT_RPE = 7;
export const MON14_DAY_A_RDL_KG = 50;
export const MON14_DAY_A_RDL_REPS = 8;
export const MON14_DAY_A_RDL_RPE = 6;
export const MON14_DAY_A_LUNGE_KG = 37.5;
export const MON14_DAY_A_LUNGE_REPS = 8;
export const MON14_DAY_A_LUNGE_RPE = 7;
export const MON14_DAY_A_PLANK_KG = 5;
export const MON14_DAY_A_PLANK_RPE = 7;
export const MON14_DAY_A_PLANK_SECONDS = [120, 120, 60] as const;
export const MON14_DAY_A_NOTES =
  'Mon 14 Day A reference / reconstructed (recovery). Known gym-logged: squat 57.5×3×4 @7 soft GREEN, RDL 50×8×3 @6, reverse lunge 37.5×8×3 @7, plank +5 kg 120s/120s/60s @7.';

export const A2HS_EMPTY_STORE_LINE =
  'Add to Home Screen again uses a new empty store; export JSON before deleting the icon.';

export class SessionBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionBackupError';
  }
}

export interface SessionBackup {
  schema: typeof BACKUP_SCHEMA;
  schema_version: number;
  exported_at: string;
  sessions: SessionDraft[];
}

export interface ParsedSessionBackup {
  schema: typeof BACKUP_SCHEMA;
  schema_version: number;
  exported_at?: string;
  sessions: SessionDraft[];
}

export interface ImportResult {
  mode: ImportMode;
  sessions: number;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SessionBackupError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asTemplateDay(value: unknown, label: string): TemplateDay {
  if (value === 'A' || value === 'B' || value === 'C' || value === 'D') return value;
  if (value === 'Mon' || value === 'Tue' || value === 'Thu' || value === 'Fri') return value;
  throw new SessionBackupError(`${label} needs a template day (A–D or Mon/Tue/Thu/Fri)`);
}

function asSet(value: unknown, label: string): LoggedSet {
  const row = asRecord(value, label);
  if (typeof row.weight_kg !== 'number' || Number.isNaN(row.weight_kg)) {
    throw new SessionBackupError(`${label}.weight_kg must be a number`);
  }
  if (typeof row.reps !== 'number' || Number.isNaN(row.reps)) {
    throw new SessionBackupError(`${label}.reps must be a number`);
  }
  const set: LoggedSet = {
    weight_kg: row.weight_kg,
    reps: row.reps,
    rpe: typeof row.rpe === 'number' ? row.rpe : 7,
    completed: row.completed !== false,
  };
  if (typeof row.amrap === 'boolean') set.amrap = row.amrap;
  if (typeof row.warmup === 'boolean') set.warmup = row.warmup;
  if (typeof row.target_weight_kg === 'number') set.target_weight_kg = row.target_weight_kg;
  if (typeof row.target_reps === 'number') set.target_reps = row.target_reps;
  return set;
}

function asReadiness(value: unknown): Readiness {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_READINESS;
  const row = value as Record<string, unknown>;
  const light: ReadinessLight =
    row.light === 'GREEN' || row.light === 'YELLOW' || row.light === 'RED'
      ? row.light
      : DEFAULT_READINESS.light;
  const num = (key: keyof Omit<Readiness, 'light'>, fallback: number) =>
    typeof row[key] === 'number' && !Number.isNaN(row[key]) ? row[key] : fallback;
  return {
    sleep: num('sleep', DEFAULT_READINESS.sleep),
    soreness: num('soreness', DEFAULT_READINESS.soreness),
    energy: num('energy', DEFAULT_READINESS.energy),
    pain: num('pain', DEFAULT_READINESS.pain),
    motivation: num('motivation', DEFAULT_READINESS.motivation),
    light,
  };
}

function asLift(value: unknown, label: string): LoggedLift {
  const row = asRecord(value, label);
  if (typeof row.exercise_id !== 'string' || !isExerciseId(row.exercise_id)) {
    throw new SessionBackupError(`${label}.exercise_id is missing or unknown`);
  }
  if (!Array.isArray(row.sets)) {
    throw new SessionBackupError(`${label}.sets must be an array`);
  }
  const lift: LoggedLift = {
    name: typeof row.name === 'string' && row.name ? row.name : row.exercise_id,
    exercise_id: row.exercise_id,
    sets: row.sets.map((set, index) => asSet(set, `${label}.sets[${index}]`)),
  };
  if (typeof row.style === 'string') lift.style = row.style;
  if (
    row.equipment === 'barbell' ||
    row.equipment === 'cable' ||
    row.equipment === 'dumbbells' ||
    row.equipment === 'bands' ||
    row.equipment === 'bodyweight'
  ) {
    lift.equipment = row.equipment;
  }
  if (typeof row.bar_kg === 'number') lift.bar_kg = row.bar_kg;
  return lift;
}

function asSession(value: unknown, label: string): SessionDraft {
  const row = asRecord(value, label);
  if (typeof row.session_id !== 'string' || !row.session_id) {
    throw new SessionBackupError(`${label}.session_id is required`);
  }
  if (typeof row.date !== 'string' || !row.date) {
    throw new SessionBackupError(`${label}.date is required`);
  }
  if (!Array.isArray(row.lifts) || row.lifts.length === 0) {
    throw new SessionBackupError(`${label}.lifts must be a non-empty array`);
  }
  return {
    session_id: row.session_id,
    date: row.date,
    template_day: asTemplateDay(row.template_day, `${label}.template_day`),
    readiness: asReadiness(row.readiness),
    lifts: row.lifts.map((lift, index) => asLift(lift, `${label}.lifts[${index}]`)),
    pain_flag: Boolean(row.pain_flag),
    notes: typeof row.notes === 'string' ? row.notes : '',
    status: 'complete',
    updated_at:
      typeof row.updated_at === 'string' && row.updated_at
        ? row.updated_at
        : new Date().toISOString(),
  };
}

export function parseSessionBackupJson(text: string): ParsedSessionBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SessionBackupError('Not valid JSON');
  }
  const payload = asRecord(raw, 'backup');
  if (payload.schema !== BACKUP_SCHEMA) {
    throw new SessionBackupError('Not a linda-lift-sessions backup');
  }
  if (payload.schema_version !== BACKUP_SCHEMA_VERSION) {
    throw new SessionBackupError(`Unknown schema_version ${String(payload.schema_version)}`);
  }
  if (!Array.isArray(payload.sessions)) {
    throw new SessionBackupError('sessions must be an array');
  }
  return {
    schema: BACKUP_SCHEMA,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: typeof payload.exported_at === 'string' ? payload.exported_at : undefined,
    sessions: payload.sessions.map((row, index) => asSession(row, `sessions[${index}]`)),
  };
}

export function buildSessionBackup(
  sessions: readonly (SessionDraft | SessionLog)[],
  exportedAt = new Date().toISOString(),
): SessionBackup {
  return {
    schema: BACKUP_SCHEMA,
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: exportedAt,
    sessions: sessions.map((row, index) => asSession(row, `sessions[${index}]`)),
  };
}

export function sessionBackupFilename(date: string): string {
  return `linda-lift-sessions-${date}.json`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function week1ReferenceSessionId(day: CanonicalTemplateDay): string {
  return `linda-lift-seed-w1-${day}`;
}

export function isWeek1ReferenceSession(sessionId: string): boolean {
  return sessionId.startsWith('linda-lift-seed-w1-');
}

/** Known W1 T1s plus template accessory placeholders so Last: has a slot to match. */
export function week1LastReferenceSessions(): SessionDraft[] {
  return WEEK1_REFERENCE_DAYS.map(({ day, date }) => {
    const draft = createDraftSession(day, date);
    draft.session_id = week1ReferenceSessionId(day);
    draft.status = 'complete';
    draft.notes = WEEK1_REFERENCE_NOTES;
    markWorkSetsComplete(draft);
    return draft;
  });
}

export async function importSessionBackup(
  repo: SessionRepository,
  backup: ParsedSessionBackup,
  mode: ImportMode = 'merge',
): Promise<ImportResult> {
  if (mode === 'replace') {
    const existing = await repo.listRecent(10_000);
    for (const row of existing) await repo.delete(row.session_id);
  }
  for (const session of backup.sessions) {
    await repo.save({ ...session, status: 'complete' });
  }
  return { mode, sessions: backup.sessions.length };
}

export async function importSessionBackupText(
  repo: SessionRepository,
  text: string,
  mode: ImportMode = 'merge',
): Promise<ImportResult> {
  return importSessionBackup(repo, parseSessionBackupJson(text), mode);
}

export async function seedWeek1LastReference(repo: SessionRepository): Promise<number> {
  const rows = week1LastReferenceSessions();
  for (const row of rows) await repo.save(row);
  return rows.length;
}

function markWorkSetsComplete(draft: SessionDraft): void {
  for (const lift of draft.lifts) {
    lift.sets = lift.sets.map((set) => (isWarmupSet(set) ? set : { ...set, completed: true }));
  }
}

export function isMon14DayAReferenceSession(sessionId: string): boolean {
  return sessionId === MON14_DAY_A_SESSION_ID;
}

export function isReconstructedReferenceSession(sessionId: string): boolean {
  return isWeek1ReferenceSession(sessionId) || isMon14DayAReferenceSession(sessionId);
}

export function historyHasMon14DayA(
  history: readonly Pick<SessionLog, 'date' | 'template_day'>[],
): boolean {
  return history.some(
    (row) =>
      calendarYmd(row.date) === MON14_DAY_A_DATE && canonicalTemplateDay(row.template_day) === 'A',
  );
}

/**
 * Known gym-logged Mon 14 Day A: squat 57.5×3×4 @7 soft GREEN, RDL 50×8×3 @6,
 * reverse lunge 37.5×8×3 @7, plank +5 kg 120s/120s/60s @7.
 * Labeled reference / reconstructed. Does not change Week 2 program prescriptions.
 */
export function mon14DayAReferenceSession(): SessionDraft {
  const draft = createDraftSession('A', MON14_DAY_A_DATE);
  draft.session_id = MON14_DAY_A_SESSION_ID;
  draft.status = 'complete';
  draft.notes = MON14_DAY_A_NOTES;
  draft.readiness = withComputedLight(DEFAULT_READINESS, 'GREEN');
  for (const lift of draft.lifts) {
    if (lift.exercise_id === 'reverse_lunge') {
      lift.equipment = 'barbell';
      lift.bar_kg = DEFAULT_BAR_KG;
    }
    let workIndex = 0;
    lift.sets = lift.sets.map((set) => {
      if (isWarmupSet(set)) return set;
      const index = workIndex;
      workIndex += 1;
      if (lift.exercise_id === 'squat_low_bar') {
        return {
          ...set,
          weight_kg: MON14_DAY_A_SQUAT_KG,
          reps: MON14_DAY_A_SQUAT_REPS,
          rpe: MON14_DAY_A_SQUAT_RPE,
          target_weight_kg: MON14_DAY_A_SQUAT_KG,
          target_reps: MON14_DAY_A_SQUAT_REPS,
          completed: true,
        };
      }
      if (lift.exercise_id === 'rdl') {
        return {
          ...set,
          weight_kg: MON14_DAY_A_RDL_KG,
          reps: MON14_DAY_A_RDL_REPS,
          rpe: MON14_DAY_A_RDL_RPE,
          target_weight_kg: MON14_DAY_A_RDL_KG,
          target_reps: MON14_DAY_A_RDL_REPS,
          completed: true,
        };
      }
      if (lift.exercise_id === 'reverse_lunge') {
        return {
          ...set,
          weight_kg: MON14_DAY_A_LUNGE_KG,
          reps: MON14_DAY_A_LUNGE_REPS,
          rpe: MON14_DAY_A_LUNGE_RPE,
          target_weight_kg: MON14_DAY_A_LUNGE_KG,
          target_reps: MON14_DAY_A_LUNGE_REPS,
          completed: true,
        };
      }
      if (lift.exercise_id === 'plank') {
        const seconds = MON14_DAY_A_PLANK_SECONDS[index] ?? MON14_DAY_A_PLANK_SECONDS[2];
        return {
          ...set,
          weight_kg: MON14_DAY_A_PLANK_KG,
          reps: seconds,
          rpe: MON14_DAY_A_PLANK_RPE,
          target_weight_kg: MON14_DAY_A_PLANK_KG,
          target_reps: seconds,
          completed: true,
        };
      }
      return { ...set, completed: true };
    });
  }
  return draft;
}

export async function seedMon14DayAReference(repo: SessionRepository): Promise<number> {
  await repo.save(mon14DayAReferenceSession());
  return 1;
}

export function historyVisibilityLine(historyCount: number): string {
  if (historyCount <= 0) {
    return (
      'Session log empty on this install (0). Restore Week 1 weights, restore today’s Mon 14 Day A, or import session JSON here — Last: cannot fill in from a wiped store. ' +
      A2HS_EMPTY_STORE_LINE
    );
  }
  return `Last: from ${historyCount} session${historyCount === 1 ? '' : 's'} on this install.`;
}

export function lastLogGapLine(historyCount: number, matchedCount: number): string | null {
  if (historyCount <= 0 || matchedCount > 0) return null;
  return `Session log has ${historyCount} on this install — Last: needs logged work sets (not just saved sessions).`;
}
