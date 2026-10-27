import type { CanonicalTemplateDay } from '../types/session';
import { DAY_TEMPLATES } from '../data/templates';
import { TEMPLATE_DAY_LABELS } from '../domain/templateDay';

const DAYS: CanonicalTemplateDay[] = ['A', 'B', 'C', 'D'];

export function TemplatePicker({
  value,
  onChange,
  names,
}: {
  value: CanonicalTemplateDay;
  onChange: (day: CanonicalTemplateDay) => void;
  /** Short tab label when the week renames the day (recovery week). */
  names?: Partial<Record<CanonicalTemplateDay, string>>;
}) {
  return (
    <div className="template-picker" role="tablist" aria-label="Template day">
      {DAYS.map((day) => {
        const t = DAY_TEMPLATES[day];
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={value === day}
            className={`template-tab ${value === day ? 'active' : ''}`}
            onClick={() => onChange(day)}
          >
            <span className="template-letter">{day}</span>
            <span className="template-day">{t.weekday}</span>
            <span className="template-name">{names?.[day] ?? TEMPLATE_DAY_LABELS[day].split(' · ')[1]}</span>
          </button>
        );
      })}
    </div>
  );
}
