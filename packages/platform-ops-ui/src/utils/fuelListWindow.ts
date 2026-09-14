/**
 * Minimal Mon–Sun fuel list window (lookback) for ledger period defaults.
 * Dominion/Fleet share this without pulling fleet timezone helpers.
 */
import { endOfWeek, format, startOfWeek, subDays } from 'date-fns';

const FUEL_LIST_LOOKBACK_DAYS = 14;

function toYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

/** Dated list window: selected week plus lookback. Never all-time. */
export function fuelListWindow(opts: {
  startYmd: string;
  endYmd: string;
  lookbackDays?: number;
}): { startDate: string; endDate: string } {
  const lookback = opts.lookbackDays ?? FUEL_LIST_LOOKBACK_DAYS;
  return {
    startDate: addDaysYmd(opts.startYmd, -lookback),
    endDate: opts.endYmd,
  };
}

/** Current Mon–Sun statement week + lookback (browser local timezone). */
export function currentFuelListWindow(): { startDate: string; endDate: string } {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  return fuelListWindow({
    startYmd: toYmd(weekStart),
    endYmd: toYmd(weekEnd),
  });
}

export function trailingDaysWindow(
  days: number,
  asOf: Date = new Date(),
): { startDate: string; endDate: string } {
  return {
    startDate: format(subDays(asOf, days), 'yyyy-MM-dd'),
    endDate: format(asOf, 'yyyy-MM-dd'),
  };
}
