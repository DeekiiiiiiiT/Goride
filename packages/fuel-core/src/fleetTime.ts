/**
 * Fleet clock. Jamaica has no DST (UTC−5). Week membership and hour-of-day
 * use this helper so a Sunday 21:18 local trip stays on Sunday.
 * Naive strings (fuel fills) keep the written calendar day.
 * Z / offset strings are real UTC instants.
 */

export const DEFAULT_FLEET_TZ = 'America/Jamaica';

export function hasTzSuffix(s: string): boolean {
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(s);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function partsInZone(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

/** yyyy-MM-dd in the fleet timezone. Date-only and naive wall times keep their written day. */
export function fleetCalendarDay(
  date: string | Date | null | undefined,
  timezone: string = DEFAULT_FLEET_TZ,
): string {
  if (date == null) return '';
  if (date instanceof Date) {
    if (isNaN(date.getTime())) return '';
    const p = partsInZone(date, timezone);
    return p.year && p.month && p.day ? `${p.year}-${p.month}-${p.day}` : '';
  }
  const s = String(date).trim();
  if (!s) return '';
  if (!hasTzSuffix(s)) return s.slice(0, 10);
  const instant = new Date(s);
  if (isNaN(instant.getTime())) return s.slice(0, 10);
  const p = partsInZone(instant, timezone);
  return p.year && p.month && p.day ? `${p.year}-${p.month}-${p.day}` : s.slice(0, 10);
}

/** Hour 0–23 in the fleet timezone. */
export function fleetLocalHour(instant: Date, timezone: string = DEFAULT_FLEET_TZ): number {
  if (isNaN(instant.getTime())) return 0;
  const p = partsInZone(instant, timezone);
  const h = Number(p.hour);
  return Number.isFinite(h) ? h % 24 : 0;
}

function tzOffsetMs(instant: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(instant);
  const g = (t: string) => Number(fmt.find((x) => x.type === t)?.value || 0);
  let hour = g('hour');
  if (hour === 24) hour = 0;
  const localAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), hour, g('minute'), g('second'));
  return localAsUtc - instant.getTime();
}

/** Naive wall time in the fleet zone → UTC instant. Z strings parse as UTC. */
export function fleetInstantMs(
  stored: string | null | undefined,
  timezone: string = DEFAULT_FLEET_TZ,
): number | null {
  if (!stored) return null;
  const s = String(stored).trim();
  if (!s) return null;
  if (hasTzSuffix(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const naive = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s.replace(' ', 'T');
  const m = naive.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  const offset = tzOffsetMs(new Date(guess), timezone);
  return guess - offset;
}

export function isPeakLocalHour(hour: number, peakStart: number, peakEnd: number): boolean {
  if (peakStart <= peakEnd) return hour >= peakStart && hour < peakEnd;
  return hour >= peakStart || hour < peakEnd;
}
