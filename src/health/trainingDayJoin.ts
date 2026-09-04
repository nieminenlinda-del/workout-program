import { addCalendarDays, weekdayOfYmd } from './dates';
import type { DailyActiveEnergy, TrainingDayEnergy, TrainingTemplateDay } from './types';

/** Mon=A, Tue=B, Thu=C, Fri=D; Wed/Sat/Sun (and anything else) = rest. */
export function templateDayForDate(ymd: string): TrainingTemplateDay {
  switch (weekdayOfYmd(ymd)) {
    case 1:
      return 'A';
    case 2:
      return 'B';
    case 4:
      return 'C';
    case 5:
      return 'D';
    default:
      return 'rest';
  }
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
