import { formatLastPerformance, type LastPerformance } from '../domain/lastPerformance';

export function LastPerformanceHint({
  performance,
}: {
  performance: LastPerformance | null | undefined;
}) {
  const hasPrior = performance != null;
  return (
    <span className={`last-log ${hasPrior ? '' : 'dim'}`}>
      {formatLastPerformance(performance ?? null)}
    </span>
  );
}
