export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartReferences {
  goalLow: number;
  goalHigh: number;
  tested: number;
  opener: number;
}

const W = 354;
const LEFT = 36;
const RIGHT = 8;
const TOP = 12;
const BOTTOM = 28;

function showLabel(index: number, count: number): boolean {
  if (count <= 6) return true;
  if (index === 0 || index === count - 1) return true;
  const step = Math.ceil(count / 6);
  return index % step === 0;
}

function tickText(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function EstimateChart({
  points,
  yMin,
  yMax,
  ticks,
  stroke = '#e8a04a',
  ariaLabel,
  height = 208,
  references,
}: {
  points: readonly ChartPoint[];
  yMin: number;
  yMax: number;
  ticks: readonly number[];
  stroke?: string;
  ariaLabel: string;
  height?: number;
  references?: ChartReferences;
}) {
  const plotW = W - LEFT - RIGHT;
  const plotH = height - TOP - BOTTOM;
  const span = yMax - yMin || 1;
  const yOf = (value: number) => TOP + ((yMax - value) / span) * plotH;
  const xOf = (index: number) =>
    LEFT + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);

  return (
    <svg className="dash-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel}>
      {ticks.map((tick) => {
        const y = yOf(tick);
        if (y < TOP - 2 || y > TOP + plotH + 2) return null;
        return (
          <g key={tick}>
            <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} stroke="#323744" strokeWidth="1" />
            <text x={LEFT - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#9a9488">
              {tickText(tick)}
            </text>
          </g>
        );
      })}
      {references ? (
        <rect
          x={LEFT}
          y={yOf(Math.max(references.goalLow, references.goalHigh))}
          width={plotW}
          height={Math.max(2, Math.abs(yOf(references.goalLow) - yOf(references.goalHigh)))}
          fill="rgba(232,160,74,0.16)"
        />
      ) : null}
      {references ? (
        <line
          x1={LEFT}
          x2={W - RIGHT}
          y1={yOf(references.tested)}
          y2={yOf(references.tested)}
          stroke="#f4f0e6"
          strokeWidth="1.25"
        />
      ) : null}
      {references ? (
        <line
          x1={LEFT}
          x2={W - RIGHT}
          y1={yOf(references.opener)}
          y2={yOf(references.opener)}
          stroke="#9a9488"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ) : null}
      {points.length > 1 ? (
        <polyline
          points={points.map((point, index) => `${xOf(index)},${yOf(point.value)}`).join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((point, index) => {
        const x = xOf(index);
        const y = yOf(point.value);
        const [day, month] = point.label.split(' ');
        return (
          <g key={`${point.label}-${index}`}>
            <circle cx={x} cy={y} r="3.2" fill={stroke} />
            {showLabel(index, points.length) ? (
              <>
                <text x={x} y={height - 14} textAnchor="middle" fontSize="9" fill="#9a9488">
                  {day}
                </text>
                <text x={x} y={height - 4} textAnchor="middle" fontSize="9" fill="#9a9488">
                  {month}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
