/**
 * One week rule (ADR 0007): fleet-calendar Mon–Sun in America/Jamaica.
 * Deno-safe — no date-fns.
 */

export const DEFAULT_FLEET_TZ = 'America/Jamaica';

/** Branded Monday week key (yyyy-MM-dd). Mint only via periodKeyFor / dateWeekKey / asWeekKey. */
export type WeekKey = string & { readonly __brand: 'WeekKey' };

/** Trust a Monday YMD already known to be a week anchor. */
export function asWeekKey(ymd: string): WeekKey {
  return String(ymd || '').slice(0, 10) as WeekKey;
}

function calendarDayKey(input: string, timeZone: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(raw);
  if (isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return raw.slice(0, 10);
  }
}

function mondayOfYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  const dow = local.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + delta);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + days);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Fleet calendar day (yyyy-MM-dd) for a timestamp or bare date. */
export function fleetCalendarDay(dateStr: string, timezone: string = DEFAULT_FLEET_TZ): string {
  return calendarDayKey(String(dateStr || ''), timezone) || String(dateStr || '').slice(0, 10);
}

/**
 * Monday week key for any dated event. Statements must be split at import;
 * this function never applies a grace band.
 */
export function periodKeyFor(
  event: { date?: string; effectiveAt?: string; periodStart?: string } | string,
  fleetTz: string = DEFAULT_FLEET_TZ,
): WeekKey | null {
  const raw =
    typeof event === 'string'
      ? event
      : event.date || event.effectiveAt || event.periodStart || '';
  const day = calendarDayKey(String(raw), fleetTz);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return asWeekKey(mondayOfYmd(day));
}

/** Sunday of the Mon–Sun week starting at `anchor`. */
export function periodEndForAnchor(anchorYmd: string): string {
  return addDaysYmd(String(anchorYmd).slice(0, 10), 6);
}

/** Alias used by existing fleet week helpers. */
export function dateWeekKey(dateStr: string | undefined | null, fleetTz: string): WeekKey | null {
  if (!dateStr) return null;
  return periodKeyFor(dateStr, fleetTz);
}
