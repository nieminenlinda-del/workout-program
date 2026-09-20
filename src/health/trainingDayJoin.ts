import { calendarTemplateDay } from '../domain/templateDay';
import { addCalendarDays } from './dates';
import type { DailyActiveEnergy, TrainingDayEnergy, TrainingTemplateDay } from './types';

/**
 * Mon=A, Tue=B, Thu=C, Fri=D; Wed/Sat/Sun = rest, except Kraft trip dated
 * overrides (Wed 23 Sep 2026 = C, Thu 24 = D, Fri 25 = rest / massage).
 */
export function templateDayForDate(ymd: string): TrainingTemplateDay {
  return calendarTemplateDay(ymd);
}

export function isTrainingDay(templateDay: TrainingTemplateDay): boolean {
  return templateDay !== 'rest';
}

/** Given a calendar date (YYYY-MM-DD), join template day A|B|C|D|rest with active kcal. */
export function joinTrainingDay(date: string, daily?: DailyActiveEnergy | null): TrainingDayEnergy {
  return {
    date,
    template_day: templateDayForDate(date),
    active_kcal: daily?.active_kcal ?? 0,
  };
}

/** Last `n` Helsinki calendar days ending at `asOf`, newest first. */
export function lastNTrainingDays(
  daily: DailyActiveEnergy[],
  n: number,
  asOf: string,
): TrainingDayEnergy[] {
  const byDate = new Map(daily.map((row) => [row.date, row]));
  const out: TrainingDayEnergy[] = [];
  for (let offset = 0; offset < n; offset += 1) {
    const date = addCalendarDays(asOf, -offset);
    out.push(joinTrainingDay(date, byDate.get(date)));
  }
  return out;
}
