# Architecture

Linda Lift is a client-only PWA. The UI never talks to a server. Persistence is a **repository interface** with an IndexedDB implementation (`idb`) so Phase 2 can read the same `SessionLog` rows the gym UI writes.

```
src/
  types/          SessionLog, exercise IDs, Phase 2 placeholders
  data/templates  Static A–D seed (no engine)
  domain/         Readiness light, draft factory, calendar hook, countdown + interval timers
  db/             SessionRepository + IndexedDB + in-memory (tests)
  screens/        Readiness → workout → set log → rest → save; interval timer
```

## Persistence contract

`SessionRepository` (`src/db/repository.ts`):

- `save` / `get` / `listComplete` — finished sessions (engine input)
- `saveDraft` / `getDraft` / `clearDraft` — in-progress session (UI only)

`asSessionLog()` strips draft bookkeeping (`status`, `updated_at`) down to the Phase 1 schema.

IndexedDB database: `linda-lift` (v1). Stores: `sessions` (key `session_id`, index `by-date`), `drafts` (key `current`).

Swap the backend by implementing `SessionRepository`. Do not import `idb` from screens.

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
| A | 2026-09-08 → 2026-10-05 | `accumulate` |
| B | 2026-10-06 → 2026-11-02 | `intensify` |
| C | 2026-11-03 → 2026-11-21 | `peak_overreach` |

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

- Default **`hypertrophy`** between meets (accumulate, intensify, off-block, or no `target_test_date`).
- **`strength_peak` only** while `target_test_date` is in the peaking window (`peak_overreach`, `peak_taper`, `test`).
- **After the test date** → auto **`hypertrophy`**, unless a later `target_test_date` is set.
- **This cycle:** `CURRENT_CYCLE.target_test_date = 2026-11-21`. Peak mode is `strength_peak` through that date; from 2026-11-22 the hook returns `hypertrophy`.

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

Cues: `src/domain/timerCue.ts` — `navigator.vibrate` first, then a Web Audio beep (may be silent if the phone is muted). Screen Wake Lock is requested while a timer is running (`useWakeLock`).

## Exercise IDs

Snake_case enum in `src/types/exercises.ts`. Primaries exclude sumo, high-bar, and close-grip as programmed lifts. Subs and accessories are the only legal substitutions the engine should pick from.
