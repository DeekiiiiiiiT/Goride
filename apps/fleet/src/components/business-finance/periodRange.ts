/**
 * Shared period presets for Business Finance (Mon–Sun weeks in fleet local calendar).
 */
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
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
