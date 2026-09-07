export const DEFAULT_FLEET_TZ = 'America/Jamaica';

/** Offset (tz − UTC) in ms at a given instant, via Intl (no date-fns). */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/**
 * Build the exact instant for a wall clock in `timeZone` (fleet-tz explicit).
 * Host-timezone independent: the same yyyy-MM-dd + HH:mm:ss always resolves to
 * the same America/Jamaica instant on any CI/browser, so day/week bucketing is
 * stable. Falls back to a naive local construction only if Intl is unavailable.
 */
export function zonedWallClockToDate(
  ymd: string,
  timeHms: string = '12:00:00',
  timeZone: string = DEFAULT_FLEET_TZ,
): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm, ss] = String(timeHms || '12:00:00').split(':').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  try {
    const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0);
    const offset = tzOffsetMs(new Date(guess), timeZone);
    return new Date(guess - offset);
  } catch {
    return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  }
}

/** yyyy-MM-dd → local calendar Date (avoids UTC-midnight shifting the day). */
export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  // Noon local — survives America/Jamaica (UTC−5) re-projection on UTC CI hosts.
  // Midnight UTC → prior calendar day in Jamaica → wrong prior Monday week key.
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Normalize tag-import wall-clock times (incl. "11:47:00 AM") to HH:mm:ss.
 * Needed so `new Date('yyyy-MM-ddT…')` never gets Invalid Date from AM/PM suffixes.
 */
export function normalizeWallClockTime(raw: string): string {
  const pm = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (pm) {
    let h = parseInt(pm[1], 10);
    const m = pm[2];
    const s = pm[3] || '00';
    const ampm = pm[4].toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}:${s}`;
  }
  const parts = raw.trim().split(':');
  if (parts.length >= 2) {
    const sec = (parts[2] || '00').replace(/\D/g, '') || '00';
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${sec.padStart(2, '0')}`;
  }
  return '00:00:00';
}
