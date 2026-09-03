function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  const tenths = Math.round(rounded * 10) / 10;
  if (tenths === rounded) return rounded.toFixed(1);
  return rounded.toFixed(2);
}

export function NumberStepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  max = 500,
  suffix,
  large = true,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step: number;
  min?: number;
  max?: number;
  suffix: string;
  large?: boolean;
}) {
  const bump = (dir: number) => {
    const next = Math.round((value + dir * step) * 100) / 100;
    onChange(Math.min(max, Math.max(min, next)));
  };

  const display = formatNumber(value);

  return (
    <div className={`stepper ${large ? 'stepper-lg' : ''}`}>
      <span className="stepper-label">{label}</span>
      <div className="stepper-row">
        <button type="button" className="stepper-btn" onClick={() => bump(-1)} aria-label={`Decrease ${label}`}>
          −
        </button>
        <div className="stepper-value">
          <strong>{display}</strong>
          <span>{suffix}</span>
        </div>
        <button type="button" className="stepper-btn" onClick={() => bump(1)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}
