import { AnalyticsTimeRange } from '../types/analytics';

export function getAnalyticsDateRange(
  range: AnalyticsTimeRange,
  custom?: { start: string; end: string },
): { from: string; to: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === 'custom' && custom?.start && custom?.end) {
    return {
      from: new Date(custom.start).toISOString(),
      to: new Date(custom.end).toISOString(),
    };
  }

  if (range === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function formatCompactJmd(value: number) {
  if (value >= 1_000_000) return `J$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `J$${Math.round(value / 1_000)}k`;
  return `J$${Math.round(value).toLocaleString()}`;
}

export function formatTrendText(current: number, previous: number) {
  if (previous === 0) return 'No prior data';
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return 'No change';
  return `${Math.abs(change)}% vs prior period`;
}
