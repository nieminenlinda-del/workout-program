# Architecture

Linda Lift is a client-only PWA. The UI never talks to a server. Persistence is a **repository interface** with an IndexedDB implementation (`idb`) so Phase 2 can read the same `SessionLog` rows the gym UI writes.

```
src/
  types/          SessionLog, exercise IDs, Phase 2 placeholders
  data/templates  Static A–D seed (no engine)
  domain/         Readiness light, draft factory, calendar hook
  db/             SessionRepository + IndexedDB + in-memory (tests)
  screens/        Readiness → workout → set log → rest → save
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

### PowerCombo `program_mode` (hook only)

Linda’s Phase 2 engine will be Juggernaut **PowerCombo**: hypertrophy work when not peaking; peak/strength work when preparing for a test or meet.

```ts
type ProgramMode = 'hypertrophy' | 'peak';
```

`program_mode` is the product switch. Do not add it to `SessionLog` or the Phase 1 logging UI. The engine reads it from `getMesocycleContext(asOf).program_mode`.

| Field | Values | Role |
| --- | --- | --- |
| `program_mode` | `hypertrophy` \| `peak` | Product / engine switch |
| `training_mode` | `hypertrophy` \| `strength_peak` | Same switch (`peak` === `strength_peak`) |

This cycle peaks toward **2026-11-21** (`TARGET_TEST_DATE`). Until that date, Block C resolves to `program_mode: "peak"`; from 2026-11-22 it returns to `"hypertrophy"` unless a next test date is set.

Resolver (`resolveTrainingMode` in `src/domain/phase2Calendar.ts`):

- Default **hypertrophy** between meets (accumulate / intensify, and any day without a target test).
- **strength_peak** only while `target_test_date` is in the peaking window (`peak_overreach`, `peak_taper`, `test`).
- **After the test date** → auto **hypertrophy** unless a next `target_test_date` is set.
- This cycle: `TARGET_TEST_DATE = 2026-11-21`. So Block C is `strength_peak`; from 2026-11-22 the hook returns hypertrophy.

These constants are documentation for two future engines (do not run them in Phase 1):

**strength_peak auto-prog** (`STRENGTH_PEAK_PROGRESSION_HOOK`)

- T1 load jumps of **+2.5 kg**
- Optional AMRAP
- TM **+2.5%** after a green block
- Freeze on `peak_taper` and `test`

**hypertrophy auto-prog** (`HYPERTROPHY_PROGRESSION_HOOK`)

- Progress **reps before load** in the **6–12** range
- Recalc TM every **8–12 weeks** or after a test
- Deload every **4–6 weeks**

Phase 1 session logging UI does not read these hooks for weights, reps, or RPE.

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

## Exercise IDs

Snake_case enum in `src/types/exercises.ts`. Primaries exclude sumo, high-bar, and close-grip as programmed lifts. Subs and accessories are the only legal substitutions the engine should pick from.
