/**
 * Shared period presets for Business Finance (Mon–Sun weeks in fleet local calendar).
 */
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  subWeeks,
  subMonths,
  subDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns';
import type { BusinessFinancePeriod, PeriodPreset } from './types';

export function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Custom applies only when both dates are set.
 * Half-filled custom falls back to this_week so the query never silently lies.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string,
  now = new Date(),
): BusinessFinancePeriod {
  if (preset === 'custom' && customStart && customEnd) {
    return { preset: 'custom', startYmd: customStart, endYmd: customEnd };
  }
  if (preset === 'today') {
    const day = ymd(startOfDay(now));
    return { preset: 'today', startYmd: day, endYmd: day };
  }
  // Incomplete custom: keep last non-custom preset for the query (UI shows hint)
  if (preset === 'this_month') {
    return {
      preset: 'this_month',
      startYmd: ymd(startOfMonth(now)),
      endYmd: ymd(endOfMonth(now)),
    };
  }
  const weekOpts = { weekStartsOn: 1 as const };
  if (preset === 'last_week') {
    const last = subWeeks(now, 1);
    return {
      preset: 'last_week',
      startYmd: ymd(startOfWeek(last, weekOpts)),
      endYmd: ymd(endOfWeek(last, weekOpts)),
    };
  }
  return {
    preset: 'this_week',
    startYmd: ymd(startOfWeek(now, weekOpts)),
    endYmd: ymd(endOfWeek(now, weekOpts)),
  };
}

/** Matching prior window for % change badges (same length immediately before current). */
export function previousPeriod(period: BusinessFinancePeriod): BusinessFinancePeriod {
  const start = parseISO(period.startYmd);
  const end = parseISO(period.endYmd);
  const days = Math.max(0, differenceInCalendarDays(end, start));

  if (period.preset === 'today') {
    const y = ymd(subDays(start, 1));
    return { preset: 'custom', startYmd: y, endYmd: y };
  }
  if (period.preset === 'this_month') {
    const prev = subMonths(start, 1);
    return {
      preset: 'custom',
      startYmd: ymd(startOfMonth(prev)),
      endYmd: ymd(endOfMonth(prev)),
    };
  }
  if (period.preset === 'this_week' || period.preset === 'last_week') {
    const weekOpts = { weekStartsOn: 1 as const };
    const prior = subWeeks(start, 1);
    return {
      preset: 'custom',
      startYmd: ymd(startOfWeek(prior, weekOpts)),
      endYmd: ymd(endOfWeek(prior, weekOpts)),
    };
  }
  // Custom: same-length window ending the day before start
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, days);
  return {
    preset: 'custom',
    startYmd: ymd(prevStart),
    endYmd: ymd(prevEnd),
  };
}

export function formatPeriodLabel(period: BusinessFinancePeriod): string {
  try {
    const a = parseISO(period.startYmd);
    const b = parseISO(period.endYmd);
    return `${format(a, 'MMM d')} – ${format(b, 'MMM d, yyyy')}`;
  } catch {
    return `${period.startYmd} – ${period.endYmd}`;
  }
}

export function inPeriod(dateYmd: string, period: BusinessFinancePeriod): boolean {
  const d = String(dateYmd || '').slice(0, 10);
  if (!d) return false;
  return d >= period.startYmd && d <= period.endYmd;
}
