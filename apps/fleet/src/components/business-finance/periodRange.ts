/**
 * Shared period presets for Business Finance (Mon–Sun weeks in fleet local calendar).
 */
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns';
import { periodKeyFor, periodEndForAnchor, fleetCalendarDay, DEFAULT_FLEET_TZ } from '@roam/finance-core';
import type { BusinessFinancePeriod, PeriodPreset } from './types';

export function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function addDaysYmd(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days, 12, 0, 0);
  return ymd(dt);
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
  const jamaicaDay = fleetCalendarDay(now.toISOString(), DEFAULT_FLEET_TZ);
  if (preset === 'today') {
    return { preset: 'today', startYmd: jamaicaDay, endYmd: jamaicaDay };
  }
  if (preset === 'last_90_days') {
    return {
      preset: 'last_90_days',
      startYmd: addDaysYmd(jamaicaDay, -89),
      endYmd: jamaicaDay,
    };
  }
  if (preset === 'this_month') {
    const monthStart = jamaicaDay.slice(0, 8) + '01';
    const parsed = parseISO(monthStart);
    return {
      preset: 'this_month',
      startYmd: ymd(startOfMonth(parsed)),
      endYmd: ymd(endOfMonth(parsed)),
    };
  }
  const thisMonday = periodKeyFor(jamaicaDay, DEFAULT_FLEET_TZ) || jamaicaDay;
  if (preset === 'last_week') {
    const lastMonday = addDaysYmd(thisMonday, -7);
    return {
      preset: 'last_week',
      startYmd: lastMonday,
      endYmd: periodEndForAnchor(lastMonday),
    };
  }
  return {
    preset: 'this_week',
    startYmd: thisMonday,
    endYmd: periodEndForAnchor(thisMonday),
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
    const priorMonday = addDaysYmd(period.startYmd, -7);
    return {
      preset: 'custom',
      startYmd: priorMonday,
      endYmd: periodEndForAnchor(priorMonday),
    };
  }
  // last_90_days / custom: same-length window ending the day before start
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
  if (period.preset === 'this_week' || period.preset === 'last_week') {
    return periodKeyFor(d, DEFAULT_FLEET_TZ) === period.startYmd;
  }
  return d >= period.startYmd && d <= period.endYmd;
}
