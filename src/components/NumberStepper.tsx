import { useEffect, useState } from 'react';

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  const tenths = Math.round(rounded * 10) / 10;
  if (tenths === rounded) return rounded.toFixed(1);
  return rounded.toFixed(2);
}

function parseTypedNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
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
  hint,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step: number;
  min?: number;
  max?: number;
  suffix: string;
  large?: boolean;
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState(formatNumber(value));

  useEffect(() => {
    if (!editing) setTyped(formatNumber(value));
  }, [value, editing]);

  const bump = (dir: number) => {
    const next = Math.round((value + dir * step) * 100) / 100;
    onChange(Math.min(max, Math.max(min, next)));
  };

  const commitTyped = () => {
    const parsed = parseTypedNumber(typed);
    setEditing(false);
    if (parsed == null) {
      setTyped(formatNumber(value));
      return;
    }
    onChange(Math.min(max, Math.max(min, Math.round(parsed * 100) / 100)));
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
          {editing ? (
            <input
              className="stepper-input"
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              aria-label={`${label} ${suffix}`}
              value={typed}
              autoFocus
              onChange={(e) => setTyped(e.target.value)}
              onBlur={commitTyped}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === 'Escape') {
                  setTyped(formatNumber(value));
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="stepper-edit"
              onClick={() => {
                setTyped(display);
                setEditing(true);
              }}
              aria-label={`Type ${label}`}
            >
              <strong>{display}</strong>
            </button>
          )}
          <span>{suffix}</span>
        </div>
        <button type="button" className="stepper-btn" onClick={() => bump(1)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
      {hint ? <p className="stepper-hint">{hint}</p> : null}
    </div>
  );
}
