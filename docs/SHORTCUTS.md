# Linda Health Sync (iOS Shortcuts)

Daily active energy from Apple Health into Linda Lift **without** Polar AccessLink, native HealthKit, or a backend.

Linda Lift is a static GitHub Pages PWA. There is no server that can receive a POST into IndexedDB, so the Shortcut writes a small JSON file to **iCloud Drive**. Open Linda Lift → **Apple Health** → **Import Health file** and pick that JSON. Same UX as the existing Health export import, and it works offline.

Polar Flow → Apple Health stays the single data pipe. Shortcuts only reads what Health already has.

The file is origin-scoped with Ravinto (`nieminenlinda-del.github.io`), so both PWAs share IndexedDB `linda-health`. **The JSON schema is identical** — the same file works in Ravinto too.

Action names below are English. On a Finnish iPhone the Shortcuts app is **Komennot**; search for the same actions.

## Overview (same 7 steps)

1. Shortcuts app → New → name **Linda Health Sync**
2. Prefer Activity Summary for daily Move/active kcal (Find Activity Summaries for yesterday / last 7 days). Fallback if missing: Find Health Samples → Active Energy → date filter → Calculate Statistics Sum
3. Optional Find Workouts for same range
4. Build Dictionary matching schema; convert to JSON text
5. Save File → iCloud Drive / Linda Health / `linda-health-shortcut.json` (Overwrite On, Ask Where Off)
6. Optional daily Personal Automation ~08:00
7. In Linda Lift: Health → Import → pick the JSON

## Tap-by-tap on iPhone

### 0. Folder

1. Open **Files**.
2. **Browse** → **iCloud Drive** → **New Folder**.
3. Name it `Linda Health`.

### 1. New Shortcut

1. Open **Shortcuts**.
2. Tap **+** (top right).
3. Tap the title at the top → name it **Linda Health Sync**.
4. Allow Health access when asked (Activity, Active Energy, Workouts).

### 2. Dates (yesterday; optional last 7 days)

Start with **yesterday** (the Move ring is usually complete by morning). Add a 7-day repeat later if you want a short backfill.

1. **Add Action** → search **Date** → **Date** (Current Date).
2. **Add Action** → **Adjust Date** → **Subtract** **1** **day**. Long-press the result → **Rename** → `Target Date`.
3. **Add Action** → **Format Date** on **Target Date**:
   - Date Format: **Custom** `yyyy-MM-dd` (or Date Style **ISO 8601** date-only).
   - Rename → `Date Stamp`.
4. **Add Action** → **Format Date** on **Current Date** (not yesterday) with time + timezone, ISO 8601. Rename → `Exported At` (this is `exported_at`).

### 3. Prefer Activity Summary (daily kcal)

This matches Linda Lift’s Health export logic (Activity Summary / Move ring first).

1. **Add Action** → **Find Activity Summaries**.
2. Tap **Filter** → **Add Filter**:
   - **Date** *is* **Target Date** (yesterday), **or**
   - **Date** *is in the last* **7 days** if you want a backfill.
3. **Sort by** Date, **Order** Latest First. **Limit** **1** for the yesterday-only path.
4. **Add Action** → **Get Details of Activity Summaries** → **Active Energy Burned**. Rename → `Active kcal`.
5. **Add Action** → **Get Details of Activity Summaries** → **Active Energy Burned Unit** if that detail exists; otherwise **Add Action** → **Text** → `kcal`. Rename → `Unit`.

If **Find Activity Summaries** does not appear in the action list on your iOS version, skip this block and use section 4.

### 4. Fallback: Active Energy samples

Use this only when Activity Summaries is missing or returns nothing.

1. **Add Action** → **Find Health Samples**.
2. Type: **Active Energy**.
3. **Add Filter**:
   - **Start Date** *is after* start of **Target Date**, and
   - **End Date** *is before* end of **Target Date**
   - (or **Start Date** *is in the last* **7 days**).
4. **Add Action** → **Calculate Statistics** → **Sum**. Rename → `Active kcal`.
5. **Add Action** → **Text** → `kcal`. Rename → `Unit`.
6. Sources for the JSON: `Active Energy` (do **not** put `ActivitySummary` on this path).

### 5. Optional workouts (same range)

Linda Lift does **not** add workout kcal on top of the daily total. You can still attach an empty list (or skip this section).

1. **Add Action** → **Find Workouts**.
2. **Add Filter**: **Start Date** *is* **Target Date** (or *is in the last* **7 days**).
3. Optional **Repeat with Each** over those workouts if you want metadata in `workouts`. Otherwise leave `workouts` as an empty **List**.

### 6. Build nested Dictionary values

Shortcuts has no “export JSON” button. Build dictionaries with the **exact keys** in the schema below.

1. **Add Action** → **Dictionary**. Rename → `Activity Summary`:
   - Key `activeEnergyBurned` → **Active kcal**
   - Key `unit` → **Unit** (`kcal`)
2. **Add Action** → **List**. Rename → `Sources`. Items: `ActivitySummary`, `Apple Watch`  
   (fallback path: `Active Energy`, `Apple Watch`).
3. **Add Action** → **List**. Rename → `Workouts` (leave empty if you skipped section 5).
4. **Add Action** → **Dictionary**. Rename → `Day`:
   - `date` → **Date Stamp**
   - `active_kcal` → **Active kcal**
   - `sources` → **Sources**
   - `activity_summary` → **Activity Summary** (omit this key on the sample-sum fallback)
   - `workouts` → **Workouts**
5. **Add Action** → **List**. Rename → `Days` → add **Day**.  
   Last 7 days: **Add Action** → **Repeat** 7 times; inside the loop **Adjust Date** by Repeat Index days ago, rebuild **Day**, **Add to Variable** `Days`.
6. **Add Action** → **Dictionary**. Rename → `Root`:
   - `schema` → Text `linda-health-shortcut` (must match exactly)
   - `schema_version` → Number `1`
   - `exported_at` → **Exported At**
   - `timezone` → Text `Europe/Helsinki`
   - `source` → Text `iOS Shortcuts`
   - `days` → **Days**

**Set Dictionary Value** / **Get Dictionary Value** are fine if that is easier than filling every key in one Dictionary action.

If you start from pasted JSON instead of building keys: **Add Action** → **Text** (paste the canonical JSON) → **Add Action** → **Get Dictionary from Input** (input type **Text**) → **Set Dictionary Value** for `days` / `exported_at` → then convert back to text in the next section.

### 7. Dictionary → JSON text → Save File

1. **Add Action** → **Get Text from Dictionary** with **Root** as input.  
   Some iOS versions label this **Get Text from Input** (pass the Dictionary; the output is JSON text). Rename → `JSON Text`.
2. **Add Action** → **Save File**:
   - File / input: **JSON Text**
   - Destination / Service: **iCloud Drive**
   - Path / folder: `Linda Health`
   - File name: `linda-health-shortcut.json`
   - **Ask Where to Save**: **Off**
   - **Overwrite If File Exists**: **On**
3. If **Save File** only offers the Shortcuts folder, use path `Shortcuts/Linda Health/linda-health-shortcut.json` and pick that same file in Linda Lift. Create the subfolder in **Files** first.
4. Optional: **Add Action** → **Show Notification** → `Linda Health Sync saved`.

### 8. Daily Personal Automation ~08:00

1. Shortcuts → **Automation** tab → **+** → **Personal Automation**.
2. **Time of Day** → `08:00`.
3. **Next** → **Run Shortcut** → **Linda Health Sync**.
4. Turn **Ask Before Running** **Off** if you want it silent (iOS 18: **Run Immediately**).
5. Allow Health + Files access when prompted.

### 9. Import in Linda Lift

1. Open Linda Lift (Safari or the Home Screen icon).
2. **Apple Health** → **Import Health file**.
3. Pick `linda-health-shortcut.json` from iCloud Drive / Linda Health (iCloud may take a few seconds to sync).

A full Health export (`.zip` / `export.xml`) still imports through the existing worker. Use that for a bulk backfill; use Shortcuts for the daily 08:00 path.

### 10. First-run check

1. Run **Linda Health Sync** once by hand.
2. Files → iCloud Drive → Linda Health → open `linda-health-shortcut.json`.
3. Confirm `"schema": "linda-health-shortcut"` and yesterday’s `days[0].date` / `active_kcal`.
4. Import in Linda Lift. That date’s kcal should match.

## Canonical JSON

Save exactly this shape (`schema` and `schema_version` must match). Do not rename keys.

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
      "workouts": []
    }
  ]
}
```

Linda Lift upserts each `days[]` row into `daily_active_energy` in DB `linda-health`. Daily kcal **prefers** `activity_summary.activeEnergyBurned` (Activity Summary / Move ring). If that object is missing, it uses `active_kcal`. Workout entries are optional metadata and are **not** added on top.

## Out of scope

- Polar AccessLink
- Native HealthKit in the PWA
- Any backend POST
