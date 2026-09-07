import { EQUIPMENT_ARIA, EQUIPMENT_LABELS, type Equipment } from '../types/exercises';

export function EquipmentPicker({
  options,
  value,
  onChange,
}: {
  options: readonly Equipment[];
  value: Equipment;
  onChange: (next: Equipment) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="equip-row" role="listbox" aria-label="Equipment">
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
          {EQUIPMENT_LABELS[eq]}
        </button>
      ))}
    </div>
  );
}
