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

/**
 * U-5/U-6: scale sparkline display to max |value| so large absolute weeks
 * still show relative shape. Magnitude hard-gates stay on the raw series.
 */
export function normalizeSparkSeriesToMax(series: number[]): number[] {
  if (series.length === 0) return series;
  let maxAbs = 0;
  for (const v of series) {
    const a = Math.abs(Number(v) || 0);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs <= 0) return series.map(() => 0);
  return series.map((v) => (Number(v) || 0) / maxAbs);
}
