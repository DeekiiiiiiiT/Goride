/**
 * Monday week key (yyyy-MM-dd) for a calendar date in the fleet's time zone.
 * Moved out of the old toll period reset (docs/toll-old-system-removal-audit.md S2); unchanged.
 */
import { startOfWeek, format } from "npm:date-fns";
import { fleetCalendarDay } from "./timezone_helper.tsx";

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

export function weekKeyForDateStr(dateStr: string, timezone: string): string {
  const day = fleetCalendarDay(dateStr, timezone) || String(dateStr).slice(0, 10);
  let base = ymdToLocalDate(day);
  if (isNaN(base.getTime())) base = new Date(dateStr);
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  return format(weekStart, "yyyy-MM-dd");
}
