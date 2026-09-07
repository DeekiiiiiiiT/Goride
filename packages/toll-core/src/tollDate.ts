import {
  DEFAULT_FLEET_TZ,
  normalizeWallClockTime,
  ymdToLocalDate,
  zonedWallClockToDate,
} from './wallClock.ts';

/**
 * Toll date parsing leaf — fleet-canonical, fleet-tz explicit.
 *
 * A bare `yyyy-MM-dd` or `yyyy-MM-dd` + wall-clock time is resolved as an
 * America/Jamaica wall clock (not the host/browser timezone), so day and week
 * bucketing are identical on a UTC CI box, a US laptop, and a phone abroad.
 * Timestamps that already carry an offset/`Z` are unambiguous instants and are
 * parsed as-is.
 *
 * No React / timezone hooks — only pure wall-clock helpers.
 */

/** Minimal shape for getTollTransactionDate (avoids FinancialTransaction coupling). */
export interface TollDateSource {
  date?: string | null;
  time?: string | null;
}

export function parseTollDate(
  date: string | null | undefined,
  time?: string | null,
  fleetTz: string = DEFAULT_FLEET_TZ,
): Date {
  const raw = String(date || '');
  if (!raw) return new Date(NaN);
  try {
    // Already an offset/Z-bearing timestamp: the instant is unambiguous.
    if (raw.includes('T') && (/[Zz]|[+-]\d{2}:\d{2}$/.test(raw) || !time)) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
    }
    const isYmd = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    // Bare YMD with no time → fleet-tz noon (stable day on any host).
    if (isYmd && !time) return zonedWallClockToDate(raw, '12:00:00', fleetTz);

    const timeStr = time || '12:00:00';
    // Tag imports store "11:47:00 AM" — must convert before Date parse or it is Invalid.
    const cleanTime = normalizeWallClockTime(timeStr.length >= 5 ? timeStr : '12:00:00');
    if (isYmd) {
      const local = zonedWallClockToDate(raw, cleanTime, fleetTz);
      return !isNaN(local.getTime()) ? local : zonedWallClockToDate(raw, '12:00:00', fleetTz);
    }
    // Non-YMD, non-Z string (e.g. local "yyyy-MM-ddThh:mm"): resolve in fleet tz.
    const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
    if (ymdMatch) {
      const zoned = zonedWallClockToDate(ymdMatch[1], normalizeWallClockTime(ymdMatch[2]), fleetTz);
      if (!isNaN(zoned.getTime())) return zoned;
    }
    const fallback = new Date(raw);
    return !isNaN(fallback.getTime()) ? fallback : new Date(NaN);
  } catch {
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? zonedWallClockToDate(raw, '12:00:00', fleetTz) : new Date(raw);
  }
}

/** Parse a toll charge's date/time (same rules the reconciliation tables use). */
export function getTollTransactionDate(tx: TollDateSource, fleetTz: string = DEFAULT_FLEET_TZ): Date {
  return parseTollDate(tx.date, tx.time, fleetTz);
}

export { normalizeWallClockTime, ymdToLocalDate, zonedWallClockToDate, DEFAULT_FLEET_TZ } from './wallClock.ts';
