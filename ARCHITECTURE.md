# Architecture

Linda Lift is a client-only PWA. The UI never talks to a server. Persistence is a **repository interface** with an IndexedDB implementation (`idb`) so Phase 2 can read the same `SessionLog` rows the gym UI writes.

```
src/
  types/          SessionLog, exercise IDs, Phase 2 placeholders
  data/templates  Static A–D seed (no engine)
  domain/         Readiness light, draft factory, calendar hook, countdown + interval timers
  db/             SessionRepository + IndexedDB + in-memory (tests)
  health/         Shared linda-health store, Apple export parser, training-day join
  screens/        Readiness → workout → set log → rest → save; interval timer; Health import
```

## Persistence contract

`SessionRepository` (`src/db/repository.ts`):

- `save` / `get` / `listComplete` — finished sessions (engine input)
- `saveDraft` / `getDraft` / `clearDraft` — in-progress session (UI only)

`asSessionLog()` strips draft bookkeeping (`status`, `updated_at`) down to the Phase 1 schema.

IndexedDB database: `linda-lift` (v1). Stores: `sessions` (key `session_id`, index `by-date`), `drafts` (key `current`).

Swap the backend by implementing `SessionRepository`. Do not import `idb` from screens.

## Shared Apple Health store (`linda-health`)

Apple Health export ingest is a **separate** IndexedDB, name exactly `linda-health` (v1). It is not mixed into `linda-lift`, so session logging / timers / Phase 2 hooks stay untouched.

Ravinto (calorie-tracker) is deployed on the **same origin** (`https://nieminenlinda-del.github.io/calorie-tracker/`). IndexedDB is origin-scoped, so both PWAs can open `linda-health` if they use this name and schema. This repo is the source of truth for the store; calorie-tracker should not bump `HEALTH_DB_VERSION` without coordinating.

```
src/health/
  constants.ts     HEALTH_DB_NAME = 'linda-health', Europe/Helsinki, Shortcuts schema id
  types.ts         HealthSample, DailyActiveEnergy, ImportMeta, ShortcutPayload
  parse/           fflate unzip + saxes (Web Worker) — never DOMParser a giant string
  parse/shortcutJson.ts  iCloud Drive JSON handoff (`linda-health-shortcut`)
  rollup.ts        daily active kcal from ActiveEnergyBurned / ActivitySummary
  trainingDayJoin  date → { template_day A|B|C|D|rest, active_kcal }
```

Stores:

| Store | Key | Shape |
| --- | --- | --- |
| `health_samples` | `id` | `{ id, type, sourceName, unit, value, startDate, endDate, workoutId? }` plus derived `day` (Helsinki) for indexes |
| `daily_active_energy` | `date` | `{ date, active_kcal, sources[] }` |
| `import_meta` | `current` | last import time, export date if present, sample counts |

`id` is the dedupe key `(type, sourceName, startDate, endDate, value)`. Re-importing the same export is idempotent.

Day buckets and the last-N-days view use **Europe/Helsinki**, not the device locale.

Ingested types: `ActiveEnergyBurned`, `BasalEnergyBurned`, `HKWorkout` (opening-tag `totalEnergyBurned` or nested `WorkoutStatistics`), `ActivitySummary.activeEnergyBurned`, `HeartRate` (stored, not used in the daily active rollup). Daily `active_kcal` prefers ActivitySummary for that Helsinki date, else sums ActiveEnergyBurned samples. Workout kcal is stored but not added on top. v1 skips `workout-routes/*.gpx`. Polar Beat is ingested only as Health `Workout` records already on the phone.

The UI file picker posts zip/xml to `src/health/parse/worker.ts`, which stream-unzips and SAX-parses. Full exports can be hundreds of MB of XML and must never be `DOMParser`’d as one string. `.json` files are the iOS Shortcuts iCloud Drive handoff (`linda-health-shortcut`); they upsert `daily_active_energy` on the main thread via `putDaily` (tiny payload). Tests use tiny fixtures that match real attribute shapes (`+0300`, curly apostrophe in `Linda’s Apple Watch`, multi-line Polar `Workout` tags) plus the canonical Shortcuts JSON.

## Phase 2 plug-in: progression engine

**Not implemented.** Types live in `src/types/phase2.ts`. The stub `progressionEngineStub.proposeNext` throws `Phase2NotImplementedError`. Do not call it from session screens.

### What the engine will consume

1. `SessionLog[]` from `repo.listComplete()` (chronological).
2. `TrainingMaxes` — seed values for types/docs only:

   | Lift | TM |
   | --- | --- |
   | Squat | 67.5 kg |
   | Bench | 50 kg |
   | Deadlift | 85 kg |

3. `asOf` date (ISO `YYYY-MM-DD`).

### Calendar (hook only)

`getMesocycleContext(date)` maps the 2026 test cycle. It is a **label/calendar helper**, not load selection.

| Block | Window | Default phase |
| --- | --- | --- |
| A | 2026-09-07 → 2026-10-04 | `accumulate` |
| B | 2026-10-05 → 2026-11-01 | `intensify` |
| C | 2026-11-02 → 2026-11-21 | `peak_overreach` |

Block C refinements already encoded in the hook:

- from **2026-11-17** → `peak_taper`
- **2026-11-21** → `test`

`BlockPhase`: `accumulate | intensify | peak_overreach | peak_taper | test`.

### PowerCombo `training_mode` (hook only — engines not implemented)

Linda’s Phase 2 engines will be Juggernaut **PowerCombo**. Types: `src/types/phase2.ts`. Calendar resolver: `resolveTrainingMode` / `getMesocycleContext`. Phase 1 logging does not read these fields.

```ts
type TrainingMode = 'hypertrophy' | 'strength_peak';
type ProgramMode = 'hypertrophy' | 'peak'; // same switch; peak === strength_peak
```

**Mode rules**

- **No `target_test_date`** → **`hypertrophy`**.
- **While a test date is set and `asOf <= target_test_date`** → **`strength_peak`**. That includes accumulate, intensify, and off-block dates before the test — not only `peak_overreach` / `peak_taper` / `test`.
- **After the test date** → auto **`hypertrophy`**, unless a later `target_test_date` is set.
- **This cycle:** `CURRENT_CYCLE.target_test_date = 2026-11-21`. Mode is **`strength_peak` from day one** of Block A (2026-09-07) through the test date — not only `peak_overreach` / `peak_taper` / `test`. From 2026-11-22 the hook returns `hypertrophy`. Seeded TMs (docs only): squat **67.5** / bench **50** / deadlift **85** kg.

**Strength auto-prog** (`STRENGTH_PEAK_PROGRESSION_HOOK`, used when `training_mode === "strength_peak"`)

- T1 load jumps of **+2.5 kg**
- Optional AMRAP
- TM **+2.5%** after a green block
- **Freeze** on `peak_taper` and `test` (`freeze_on`)

**Hypertrophy auto-prog** (`HYPERTROPHY_PROGRESSION_HOOK`, used when `training_mode === "hypertrophy"`)

- Progress **reps before load** in the **6–12** range
- Recalc TM every **8–12 weeks** or after a test
- Deload every **4–6 weeks**

`progressionRulesFor(training_mode)` returns the matching constants. It does **not** compute next-session weights. `progressionEngineStub.proposeNext` still throws `Phase2NotImplementedError`.

Do not add `training_mode` / `program_mode` to `SessionLog` or the Phase 1 set-logging UI.

## Last-week performance (Phase 1 read of SessionLog)

`src/domain/lastPerformance.ts` reads completed IndexedDB sessions (`repo.listComplete()`). No backend.

**Match:** same `exercise_id`, prefer the same canonical template day (A–D) — that is the previous occurrence of this day, usually ~7 days earlier. If that day has never been logged, fall back to the same exercise on any day. Only sessions with `date < asOf` count.

**Top work set:** among completed **work** sets of the matching lift, highest `weight_kg`; ties → highest `reps`; still tied → last such set. Sets with `warmup: true` are excluded. Display `Last: 50 kg × 5` (or `Last: BW × 6`). First sessions show muted `No prior log`.

Shown on the Today preview, each in-session lift card, and the set logger.

## Manual weight override (Phase 1)

Seed kg is a starting prescription, not a lock. Mid-session edits write onto the draft (`src/domain/weightOverride.ts`) so Linda does not restart the session.

- **Working weight** stepper on an expanded lift updates every **unlogged work** set. The warmup ladder is then recomputed from the new W unless a warmup is already logged.
- **Set logger** still edits that set’s kg (2.5 steppers, ±1.25 chips, tap the number to type). Completing the set stores the override on the logged set. Default apply-forward copies kg onto later unlogged sets of the **same kind** (warmup→warmup, work→work).

## Warmup sets (Phase 1)

T1 squat / bench / deadlift and Day D bench volume get a Kraft ladder **before** work sets (`src/domain/warmupLadder.ts`). W is the most common non-AMRAP work kg (else first work set). Round every warmup to 2.5; skip a step within 2.5 kg of the previous step or of W; never warmup ≥ W.

1. Bar **20 × 5–8** (skip if W ≤ 25; 8 reps when W < 40)
2. **~50% W × 5** (ceil to 10 kg; deadlift first plate at least 40 if 20/30 is pointless)
3. **~70% W × 3**
4. **~85% W × 1–2** (drop the single if W − this ≤ 5 kg)

Week 1: squat 47.5 → 20×5 / 30×5 / 40×3; bench 35 → 20×8 / 25×5 / 30×3; DL 60 → 20×5 / 40×5 / 50×3. Squat W=50 → 20×5 / 30×5 / 35×3 / 42.5×2 (raw 50% is 25; that step snaps to a 10 kg plate). Day D bench volume uses the same bench algorithm. UI labels **W1, W2…**. Warmups are logged but do **not** count as work sets for last-week lookup or Phase 2. Accessories stay warmup-free. Start is unchanged.

`shortLadder` (bar + last intermediate) exists for a later yellow / low-readiness day. Sessions still attach the full ladder.

### Freeze rules (must implement in Phase 2)

When `freezeProgression` is true (`peak_taper` or `test`):

- Do **not** auto-bump TMs or next-session loads from new logs.
- Taper week may still *display* prescribed reductions, but those come from a frozen plan, not from last-session RPE.
- Test day: prescribe **squat → bench → deadlift** only (`TEST_LIFT_ORDER`). No accessories. No AMRAP hunting; treat as a test protocol.

### Suggested engine module (future)

```
src/engine/progression.ts  implements ProgressionEngine
```

Recommended algorithm (Juggernaut/Vire-style, to be written later):

1. Group logs by `exercise_id` (primaries first: `squat_low_bar`, `bench_regular`, `deadlift_conventional`, `bench_regular_volume`).
2. Read last completed top set: `weight_kg`, `reps`, `rpe`, `amrap`.
3. If AMRAP reps beat the prescription at target RPE, nudge TM or next load; if RPE overshoots or `pain_flag`, hold or deload.
4. Respect `readiness.light`: GREEN default wave, YELLOW cap volume, RED suggest substitution from the slot’s `alternatives` (subs/accessories list) — still no sumo/high-bar/close-grip primaries.
5. Emit the **next** day’s `lifts` in the same `LoggedLift` shape so the existing workout UI can render them.

The seed templates in `src/data/templates.ts` should become the fallback when the engine has no history (week 1).

### UI integration point

Today, `createDraftSession(templateDay)` copies static slots into a draft.

Phase 2 should replace that factory call with:

```ts
const ctx = getMesocycleContext(date);
if (ctx.freezeProgression) {
  // load frozen prescription, do not call proposeNext for TM updates
}
const proposed = engine.proposeNext({
  logs,
  trainingMaxes,
  asOf: date,
  program_mode: ctx.program_mode,
  training_mode: ctx.training_mode,
  target_test_date: ctx.target_test_date,
});
```

Keep `SessionLog` field names stable. Additive fields are fine; renames break the engine.

## Timers (UX only — not SessionLog)

`src/domain/countdown.ts` is a wall-clock countdown (`endsAtMs`). Pause/resume/extend/skip are pure functions so lock-screen and background recovery do not depend on a JS interval staying alive. `src/domain/intervalTimer.ts` layers rounds + WORK/REST on top (last work has no trailing rest).

The rest overlay reads `rest_sec` from the seed template slot after each completed set. The interval screen is a separate view (`AppView: "interval"`) and does not write `SessionLog` or Phase 2 types.

Cues: `src/domain/timerCue.ts` — `navigator.vibrate` first, then a Web Audio beep (may be silent if the phone is muted). Spoken voice (`speechSynthesis`) is additive: **30s**, **10s**, and **0s** (rest: “done”; interval: next phase / done). Swedish (`sv-SE`, or any `sv*`) if `getVoices()` lists it, else English. Do not prefer Finnish. Each threshold fires once per countdown (lock-screen jumps speak only the lowest crossed mark). Skip does not speak 0s. Voice on/off lives on the rest card and interval setup (`localStorage` `linda-lift-timer-voice`, default on). Screen Wake Lock is requested while a timer is running (`useWakeLock`).

## Exercise IDs

Snake_case enum in `src/types/exercises.ts`. Primaries exclude sumo, high-bar, and close-grip as programmed lifts. Subs and accessories are the only legal substitutions the engine should pick from.
