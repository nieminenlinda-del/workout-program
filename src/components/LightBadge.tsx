import type { ReadinessLight } from '../types/session';

const LABELS: Record<ReadinessLight, string> = {
  GREEN: 'Green',
  YELLOW: 'Yellow',
  RED: 'Red',
};

export function LightBadge({
  light,
  large = false,
}: {
  light: ReadinessLight;
  large?: boolean;
}) {
  return (
    <span className={`light-badge light-${light.toLowerCase()} ${large ? 'large' : ''}`}>
      <span className="light-dot" />
      {LABELS[light]}
    </span>
  );
}
