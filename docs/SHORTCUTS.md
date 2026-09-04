# Linda Health Sync — iOS Shortcuts → Linda Lift

Daily active energy from Apple Health (Watch, Polar Flow, etc.) into Linda Lift **without** Polar AccessLink, a native HealthKit app, or a backend.

Linda Lift is a static GitHub Pages PWA. There is no server to POST into. The Shortcut writes a JSON file to **iCloud Drive**; Linda opens Linda Lift and imports that file into the existing IndexedDB `linda-health` (same store as the Health `export.xml` import).

Polar Flow → Apple Health stays the single data pipe. Shortcuts only reads what Health already merged.

**File:** iCloud Drive → `Linda Health` → `linda-health-shortcut.json` (overwrite the same name every run).

The same file works in Ravinto too (same origin, identical schema).

## In Linda Lift after the file exists

1. Open Linda Lift (Safari or Home Screen).
2. **Apple Health** → **Import Health file**.
3. Pick `linda-health-shortcut.json` from iCloud Drive → Linda Health.
4. The last-14-days active energy list updates (training day A–D vs rest). Latest import wins for that date.

The Apple Health zip/xml picker also accepts `.json` and routes it to the same importer.

## JSON schema (what the Shortcut must write)

```json
{
  "schema": "linda-health-shortcut",
  "schema_version": 1,
  "exported_at": "2026-09-04T08:00:00+03:00",
  "timezone": "Europe/Helsinki",
  "source": "iOS Shortcuts",
  "days": [
    {
      "date": "2026-09-03",
      "active_kcal": 487,
      "sources": ["ActivitySummary", "Apple Watch"],
      "activity_summary": {
        "activeEnergyBurned": 487,
        "unit": "kcal"
      },
      "workouts": [
        {
          "id": "optional-stable-id",
          "activity_type": "Traditional Strength Training",
          "start": "2026-09-03T17:00:00+03:00",
          "end": "2026-09-03T18:00:00+03:00",
          "duration_min": 60,
          "energy_kcal": 320,
          "source": "Apple Watch"
        }
      ]
    }
  ]
}
```

Rules Linda Lift applies:

- `schema` **must** be exactly `linda-health-shortcut` (anything else is rejected).
- If `activity_summary` is present, that day’s `active_kcal` comes from `activeEnergyBurned` (same as Health `<ActivitySummary>`).
- Otherwise the top-level `active_kcal` is used.
- Rows upsert by `date` (`YYYY-MM-DD`, Europe/Helsinki). Re-import overwrites that day.
- `workouts` is optional. Linda Lift does **not** add workout kcal on top of the daily total (it is already in Active Energy / Activity Summary).

---

## Create the Shortcut on iPhone

Action names below are English. On a Finnish iPhone the Shortcuts app is **Komennot**; search for the same actions in Finnish.

### 0. Folder

1. Open **Files**.
2. **iCloud Drive** → **New Folder**.
3. Name it `Linda Health`.

### 1. New Shortcut

1. Open **Shortcuts**.
2. Tap **+** → name it **Linda Health Sync**.
3. Allow Health access when asked (Active Energy / Activity / Workouts).

### 2. Dates (yesterday + optional last 7 days)

Start with **yesterday** (the Activity ring is usually complete). Add a 7-day repeat later if you want a short backfill.

1. Add **Date** (Current Date).
2. Add **Adjust Date** → Subtract **1** day. Rename this magic variable to **Target Date**.
3. Add **Format Date** on **Target Date**:
   - Date Style: **ISO 8601** (or Custom `yyyy-MM-dd`).
   - Rename the result **Date Stamp** (`YYYY-MM-DD`).

### 3. Prefer Activity Summary (daily kcal)

This matches Linda Lift’s Health export logic (Activity Summary / Move ring first).

1. Add **Find Activity Summaries**.
2. Filter: **Start Date** *is* **Target Date** (or *is today* if you sync this morning for *yesterday*, keep Target Date).
3. Limit: **1**.
4. Add **Get Details of Activity Summaries** → **Active Energy Burned**. Rename **Active kcal**.
5. Add **Get Details of Activity Summaries** → **Active Energy Burned Unit** if available; otherwise use Text `kcal`. Rename **Unit**.

If **Find Activity Summaries** is missing on your iOS version, use the fallback in section 4 instead and skip this block.

### 4. Fallback: Active Energy samples (only if Activity Summaries is unavailable)

1. Add **Find Health Samples**.
2. Type: **Active Energy**.
3. Filter: **Start Date** *is* **Target Date** (yesterday / today).
4. Add **Calculate Statistics** → **Sum**. Rename **Active kcal**.
5. Set **Unit** to Text `kcal`.
6. Set sources to `Active Energy` (not ActivitySummary).

### 5. Optional workouts (same date)

1. Add **Find Workouts**.
2. Filter: **Start Date** *is* **Target Date**.
3. Add **Repeat with Each** over those workouts:
   1. **Dictionary** with keys:
      - `activity_type` ← Workout Activity Type
      - `start` ← Start Date (ISO 8601)
      - `end` ← End Date (ISO 8601)
      - `duration_min` ← Duration (minutes)
      - `energy_kcal` ← Active Energy / Total Energy
      - `source` ← Source (e.g. Apple Watch)
      - `id` ← UUID or a stable text (`date` + start)
   2. **Add to Variable** → **Workout List**.
4. End Repeat. If there were no workouts, **Workout List** can stay empty.

### 6. Build the JSON dictionaries

Shortcuts has no “export JSON” button. Build nested **Dictionary** values, then turn the root dictionary into text.

1. **Dictionary** named **Activity Summary**:
   - `activeEnergyBurned` → **Active kcal**
   - `unit` → **Unit** (usually `kcal`)
2. **List** named **Sources**: items `ActivitySummary`, `Apple Watch` (fallback path: `Active Energy`, `Apple Watch`).
3. **Dictionary** named **Day**:
   - `date` → **Date Stamp**
   - `active_kcal` → **Active kcal**
   - `sources` → **Sources**
   - `activity_summary` → **Activity Summary** (omit this key in the sample-sum fallback)
   - `workouts` → **Workout List** (omit if you skipped workouts)
4. **List** named **Days** → add **Day**.
   - To include the last 7 days: **Repeat** 7 times, **Adjust Date** by Repeat Index days ago, run sections 3–6 inside the loop, **Add to Variable** **Days**.
5. **Dictionary** named **Root**:
   - `schema` → Text `linda-health-shortcut` (must match exactly)
   - `schema_version` → Number `1`
   - `exported_at` → **Current Date** formatted ISO 8601 (include time + timezone)
   - `timezone` → Text `Europe/Helsinki`
   - `source` → Text `iOS Shortcuts`
   - `days` → **Days**

Use **Set Dictionary Value** / **Get Dictionary Value** if a Dictionary action is easier to edit than typing every key up front.

### 7. Dictionary → JSON text → iCloud file

1. Add **Get Text from Input** (or **Get Text from Dictionary**) with **Root** as input. This produces JSON text. Rename **JSON Text**.
2. Add **Save File**:
   - File: **JSON Text**
   - Destination: **iCloud Drive**
   - Path / folder: `Linda Health`
   - File name: `linda-health-shortcut.json`
   - **Ask Where to Save**: Off
   - **Overwrite If File Exists**: On
3. Optional: **Show Notification** “Linda Health Sync saved”.

If **Save File** only offers the Shortcuts folder, save to `Shortcuts/Linda Health/linda-health-shortcut.json` instead and pick that same file in Linda Lift. Create the subfolder in Files first.

### 8. Daily Personal Automation

1. Shortcuts → **Automation** → **+** → **Personal Automation**.
2. **Time of Day** → `08:00`.
3. Next → **Run Shortcut** → **Linda Health Sync**.
4. Turn **Ask Before Running** Off if you want it silent (iOS 18: **Run Immediately**).
5. Allow Health + Files access when prompted.

Then each morning: open Linda Lift → **Apple Health** → **Import Health file** → pick the overwritten file (iCloud may take a few seconds to sync).

### 9. First-run check

1. Run **Linda Health Sync** once by hand.
2. Files → iCloud Drive → Linda Health → open `linda-health-shortcut.json`.
3. Confirm `"schema": "linda-health-shortcut"` and yesterday’s `days[0].date` / `active_kcal`.
4. Import in Linda Lift. The history row for that date should show the same kcal.

---

## Why not a backend POST?

GitHub Pages hosts only static files. A tiny POST endpoint would need Cloudflare/Workers (or similar), auth, and a way to write **this phone’s** IndexedDB — which a server cannot do. The Health export import is already a file the user picks. Shortcuts JSON is the same handoff, just small enough to run every morning instead of a 675 MB `export.xml`.
