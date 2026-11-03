import type { SessionLog } from '../../types/session';

export const VBT_CSV_HEADER =
  'date,session_id,lift,load_kg,set,rep,mean_velocity_m_s,peak_velocity_m_s,rom_cm,concentric_s,set_velocity_loss_pct,camera_rep_count';

/** One row per camera rep. Null when this session has no bar-speed reps. */
export function sessionVbtCsv(session: SessionLog): string | null {
  const date = session.date.slice(0, 10);
  const lines: string[] = [];
  for (const lift of session.lifts) {
    for (const set of lift.vbt?.sets ?? []) {
      const load = set.load_kg ?? lift.sets[set.set_index]?.weight_kg ?? '';
      const dropped = new Set(set.excluded_reps ?? []);
      const cameraCount = set.camera_rep_count ?? set.rep_count;
      for (const rep of set.reps) {
        if (dropped.has(rep.rep)) continue;
        lines.push(
          [
            date,
            cell(session.session_id),
            cell(lift.name),
            load,
            set.set_index + 1,
            rep.rep,
            round(rep.mean_velocity_m_s, 3),
            round(rep.peak_velocity_m_s, 3),
            round(rep.rom_cm, 1),
            round(rep.concentric_ms == null ? undefined : rep.concentric_ms / 1000, 3),
            round(set.velocity_loss_pct, 1),
            cameraCount,
          ].join(','),
        );
      }
    }
  }
  if (lines.length === 0) return null;
  return `${VBT_CSV_HEADER}\n${lines.join('\n')}\n`;
}

export function vbtCsvFilename(date: string): string {
  return `linda-lift-vbt-${date.slice(0, 10)}.csv`;
}

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function round(value: number | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toFixed(digits);
}
