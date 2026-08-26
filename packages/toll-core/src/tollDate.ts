import { normalizeWallClockTime, ymdToLocalDate } from './wallClock.ts';

/**
 * Toll date parsing leaf — fleet-canonical.
 *
 * Passing a bare `yyyy-MM-dd` to `new Date()` yields UTC midnight, which is the
 * previous calendar day in Jamaica. Everything toll-related routes through here.
 *
 * No React / timezone hooks — only pure wall-clock helpers.
 */

/** Minimal shape for getTollTransactionDate (avoids FinancialTransaction coupling). */
export interface TollDateSource {
  date?: string | null;
  time?: string | null;
}

export function parseTollDate(date: string | null | undefined, time?: string | null): Date {
  const raw = String(date || '');
  if (!raw) return new Date(NaN);
  try {
    // Already a timestamp: parse as-is, the instant is unambiguous.
    if (raw.includes('T')) {
      const d = new Date(raw);
      return !isNaN(d.getTime()) ? d : new Date(NaN);
    }
    const isYmd = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    if (isYmd && !time) return ymdToLocalDate(raw);

    const timeStr = time || '12:00:00';
    // Tag imports store "11:47:00 AM" — must convert before Date parse or it is Invalid.
    const cleanTime = normalizeWallClockTime(timeStr.length >= 5 ? timeStr : '12:00:00');
    if (isYmd) {
      const [y, m, d] = raw.split('-').map(Number);
      const [hh, mm, ss] = cleanTime.split(':').map(Number);
      const local = new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
      return !isNaN(local.getTime()) ? local : ymdToLocalDate(raw);
    }
    const localDate = new Date(`${raw}T${cleanTime}`);
    return !isNaN(localDate.getTime()) ? localDate : new Date(raw);
  } catch {
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? ymdToLocalDate(raw) : new Date(raw);
  }
}

/** Parse a toll charge's date/time (same rules the reconciliation tables use). */
export function getTollTransactionDate(tx: TollDateSource): Date {
  return parseTollDate(tx.date, tx.time);
}

export { normalizeWallClockTime, ymdToLocalDate } from './wallClock.ts';
