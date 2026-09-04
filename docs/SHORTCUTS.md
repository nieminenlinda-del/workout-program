# Linda Health Sync (iOS Shortcuts)

Daily active energy from Apple Health into Linda Lift **without** Polar AccessLink, native HealthKit, or a backend.

Linda Lift is a static GitHub Pages PWA. There is no server that can receive a POST into IndexedDB, so the Shortcut writes a small JSON file to **iCloud Drive**. Open Linda Lift → **Apple Health** → **Import Health file** and pick that JSON. Same UX as the existing Health export import, and it works offline.

Polar Flow → Apple Health stays the single data pipe. Shortcuts only reads what Health already has.

The file is origin-scoped with Ravinto (`nieminenlinda-del.github.io`), so both PWAs share IndexedDB `linda-health`. **The JSON schema is identical** — the same file works in Ravinto too.

## iPhone Shortcut steps

1. Shortcuts app → New → name **Linda Health Sync**
2. Prefer Activity Summary for daily Move/active kcal (Find Activity Summaries for yesterday / last 7 days). Fallback if missing: Find Health Samples → Active Energy → date filter → Calculate Statistics Sum
3. Optional Find Workouts for same range
4. Build Dictionary matching schema; convert to JSON text
5. Save File → iCloud Drive / Linda Health / `linda-health-shortcut.json` (Overwrite On, Ask Where Off)
6. Optional daily Personal Automation ~08:00
7. In Linda Lift: Health → Import → pick the JSON

## Canonical JSON

Save exactly this shape (schema name and version must match):

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

## Import in Linda Lift

1. Open Linda Lift (Safari or the Home Screen icon).
2. **Apple Health** → **Import Health file**.
3. Pick `linda-health-shortcut.json` from iCloud Drive / Linda Health.

A full Health export (`.zip` / `export.xml`) still imports through the existing worker. Use that when you need a bulk backfill; use Shortcuts for the daily 08:00 path.

## Out of scope

- Polar AccessLink
- Native HealthKit in the PWA
- Any backend POST
