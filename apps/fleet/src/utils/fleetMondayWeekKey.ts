/**
 * Mon–Sun week key helpers safe for both Vite and Deno Edge.
 * Avoids date-fns (bare imports break Supabase function bundling).
 */

/** Calendar day yyyy-MM-dd in an IANA timezone (or passthrough for bare dates). */
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

/** Monday (yyyy-MM-dd) of the Mon–Sun week containing a fleet calendar day. */
function mondayOfYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  const dow = local.getDay(); // 0=Sun … 6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + delta);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Monday week key for a date-ish string in fleet TZ.
 * Same contract as tollWeekPeriod.dateWeekKey — Edge-safe.
 */
export function dateWeekKey(
  dateStr: string | undefined | null,
  fleetTz: string,
): string | null {
  if (!dateStr) return null;
  const day = calendarDayKey(String(dateStr), fleetTz);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return mondayOfYmd(day);
}
