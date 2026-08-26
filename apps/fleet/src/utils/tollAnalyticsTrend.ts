import {
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  differenceInCalendarDays,
} from 'date-fns';
import { parseTollDate } from './tollDate';

export interface TrendRow {
  date: string;
  time?: string | null;
  isUsage: boolean;
  absAmount: number;
  /** When present, non-usage credits are split: top-up vs refund vs adjustment. */
  creditKind?: 'top-up' | 'refund' | 'adjustment' | 'usage';
}

export interface TrendBucket {
  name: string;
  /** yyyy-MM-dd key for the bucket start — used for drill-down. */
  key: string;
  spend: number;
  topups: number;
  refunds: number;
  passages: number;
}

export type TrendGranularity = 'daily' | 'monthly';

/** Short ranges get a day-by-day chart; longer ones stay monthly. */
export const DAILY_TREND_MAX_DAYS = 45;

export function trendGranularity(startYmd: string, endYmd: string): TrendGranularity {
  const start = parseTollDate(startYmd);
  const end = parseTollDate(endYmd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'monthly';
  return differenceInCalendarDays(end, start) <= DAILY_TREND_MAX_DAYS ? 'daily' : 'monthly';
}

export function buildTollTrendBuckets(
  rows: TrendRow[],
  startYmd: string,
  endYmd: string,
): { granularity: TrendGranularity; buckets: TrendBucket[] } {
  const granularity = trendGranularity(startYmd, endYmd);
  const rangeStart = parseTollDate(startYmd);
  const rangeEnd = parseTollDate(endYmd);

  if (granularity === 'daily') {
    const days =
      rangeStart <= rangeEnd
        ? eachDayOfInterval({ start: startOfDay(rangeStart), end: endOfDay(rangeEnd) })
        : [startOfDay(rangeStart)];

    const buckets = days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const inDay = rows.filter((r) => {
        const d = parseTollDate(r.date, r.time);
        return d >= dayStart && d <= dayEnd;
      });
      return summariseBucket(format(day, 'MMM d'), format(day, 'yyyy-MM-dd'), inDay);
    });
    return { granularity, buckets };
  }

  const months =
    rangeStart <= rangeEnd
      ? eachMonthOfInterval({ start: startOfMonth(rangeStart), end: endOfMonth(rangeEnd) })
      : [startOfMonth(rangeStart)];

  const buckets = months.map((month) => {
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const inMonth = rows.filter((r) => {
      const d = parseTollDate(r.date, r.time);
      return d >= mStart && d <= mEnd;
    });
    return summariseBucket(format(month, 'MMM yyyy'), format(mStart, 'yyyy-MM-dd'), inMonth);
  });
  return { granularity, buckets };
}

function summariseBucket(name: string, key: string, rows: TrendRow[]): TrendBucket {
  let spend = 0;
  let topups = 0;
  let refunds = 0;
  let passages = 0;
  for (const r of rows) {
    if (r.isUsage) {
      spend += r.absAmount;
      passages += 1;
      continue;
    }
    const kind = r.creditKind || 'top-up';
    if (kind === 'refund') refunds += r.absAmount;
    else topups += r.absAmount;
  }
  return {
    name,
    key,
    spend: Number(spend.toFixed(2)),
    topups: Number(topups.toFixed(2)),
    refunds: Number(refunds.toFixed(2)),
    passages,
  };
}
