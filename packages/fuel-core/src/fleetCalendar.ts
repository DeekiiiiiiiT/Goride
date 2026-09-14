/**
 * Minimal fleet-calendar helpers for fuel policy Monday windows (no React).
 */

/** Parse YYYY-MM-DD as local calendar Date (never UTC midnight). */
export function ymdToLocalDate(ymd: string): Date {
  const bare = String(ymd || '').split('T')[0];
  const [y, m, d] = bare.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
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
