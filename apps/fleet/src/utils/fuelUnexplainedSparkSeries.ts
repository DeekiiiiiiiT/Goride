/**
 * Trailing unexplained series for landing period cards (no new analytics pipeline).
 */
export type UnexplainedSeriesPoint = {
  startDate: string;
  unexplained: number;
};

/** Build up to `maxWeeks` unexplained values ending at `weekStart` (inclusive), chronological. */
export function buildUnexplainedSparkSeries(
  periods: UnexplainedSeriesPoint[],
  weekStart: string,
  maxWeeks = 6,
): number[] {
  const sorted = [...periods]
    .filter((p) => p.startDate && p.startDate <= weekStart)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const slice = sorted.slice(-maxWeeks);
  return slice.map((p) => Number(p.unexplained) || 0);
}

export function unexplainedWowDelta(series: number[]): number | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const cur = series[series.length - 1];
  return cur - prev;
}
