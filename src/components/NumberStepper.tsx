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
    const next = Math.round((value + dir * step) * 1000) / 1000;
    onChange(Math.min(max, Math.max(min, next)));
  };

  const display = Number.isInteger(value) ? String(value) : value.toFixed(1);

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
