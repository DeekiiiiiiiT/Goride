/**
 * Minimal fleet-calendar helpers for fuel policy Monday windows (no React, no date-fns).
 * Safe for Deno edge bundling when fuel-core is imported via relative path.
 */

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Parse YYYY-MM-DD as local calendar Date (never UTC midnight). */
export function ymdToLocalDate(ymd: string): Date {
  const bare = String(ymd || '').split('T')[0];
  const [y, m, d] = bare.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/** Local calendar YYYY-MM-DD. */
export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 local for the week containing `d` (ISO week, Mon–Sun). */
export function startOfWeekMonday(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = day.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  day.setDate(day.getDate() + diff);
  return day;
}

/** Sunday of the Mon–Sun week containing `d`. */
export function endOfWeekSunday(d: Date): Date {
  const mon = startOfWeekMonday(d);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
}

export function addWeeksLocal(d: Date, weeks: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + weeks * 7);
}

/** e.g. "Sep 15" */
export function formatMonthDay(d: Date): string {
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** e.g. "Sep 15, 2026" */
export function formatMonthDayYear(d: Date): string {
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Calendar YYYY-MM-DD in a given IANA timezone (or bare YMD pass-through). */
export function fleetTzDateKey(input: string | Date, timezone: string): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  const date = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(date.getTime())) {
    return typeof input === 'string' ? input.slice(0, 10) : '';
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return y && m && d ? `${y}-${m}-${d}` : '';
  } catch {
    return typeof input === 'string' ? input.slice(0, 10) : '';
  }
}
