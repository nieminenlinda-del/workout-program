import { EQUIPMENT_ARIA, EQUIPMENT_MODE_LABELS, type Equipment } from '../types/exercises';
import { BAR_KG_OPTIONS } from '../domain/equipment';

export function EquipmentPicker({
  options,
  value,
  onChange,
  variant = 'chips',
}: {
  options: readonly Equipment[];
  value: Equipment;
  onChange: (next: Equipment) => void;
  variant?: 'chips' | 'segment';
}) {
  if (options.length === 0) return null;
  return (
    <div
      className={variant === 'segment' ? 'equip-seg' : 'equip-row'}
      role="listbox"
      aria-label="Equipment"
    >
      {options.map((eq) => (
        <button
          key={eq}
          type="button"
          role="option"
          aria-label={EQUIPMENT_ARIA[eq]}
          aria-selected={value === eq}
          className={`chip ${value === eq ? 'selected' : ''}`}
          onClick={() => onChange(eq)}
        >
          {EQUIPMENT_MODE_LABELS[eq]}
        </button>
      ))}
    </div>
  );
}

export function BarMassPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (kg: number) => void;
}) {
  return (
    <div className="bar-row" role="listbox" aria-label="Bar weight">
      <span className="stepper-label">Bar</span>
      {BAR_KG_OPTIONS.map((kg) => (
        <button
          key={kg}
          type="button"
          role="option"
          aria-selected={value === kg}
          className={`chip ${value === kg ? 'selected' : ''}`}
          onClick={() => onChange(kg)}
        >
          {kg} kg
        </button>
      ))}
    </div>
  );
}
