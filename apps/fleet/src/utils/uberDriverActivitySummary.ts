/**
 * WRA-21: per-driver hours from the week's Uber `driver_activity.csv`, saved on the
 * import batch so Week Reconciliation step 6 can show "Activity vs trips" for that week.
 *
 * Uber writes the durations as "days : hours : minutes" (e.g. 02:08:42 = 56.7 h).
 * The older Driver Overview metrics path does not keep the week, so this is read
 * straight from the file instead.
 */
import type { FileData } from './csvHelpers';

export type UberDriverActivityRow = {
  driverId: string;
  name: string;
  tripsCompleted: number;
  onlineHours: number;
  onTripHours: number;
};

/** "D:H:M" → hours. Returns null when the value is not in that shape. */
export function parseUberDaysHoursMinutes(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  const m = /^(\d+)\s*:\s*(\d{1,2})\s*:\s*(\d{1,2})$/.exec(s);
  if (!m) return null;
  const hours = Number(m[1]) * 24 + Number(m[2]) + Number(m[3]) / 60;
  return Math.round(hours * 100) / 100;
}

function findHeader(headers: string[], ...words: string[]): string | undefined {
  return headers.find((h) => {
    const l = h.toLowerCase();
    return words.every((w) => l.includes(w));
  });
}

export function uberDriverActivityFromFiles(files: FileData[]): UberDriverActivityRow[] {
  const out = new Map<string, UberDriverActivityRow>();
  for (const f of files) {
    if (f.type !== 'uber_driver_activity') continue;
    const headers = f.headers?.length ? f.headers : Object.keys(f.rows?.[0] ?? {});
    const idKey = findHeader(headers, 'driver uuid');
    const onlineKey = findHeader(headers, 'time online') ?? findHeader(headers, 'online');
    const onTripKey = findHeader(headers, 'time on trip') ?? findHeader(headers, 'on trip');
    const tripsKey = findHeader(headers, 'trips completed');
    const firstKey = findHeader(headers, 'first name');
    const lastKey = findHeader(headers, 'last name');
    if (!idKey || !onlineKey || !onTripKey) continue;
    for (const row of f.rows || []) {
      const r = row as Record<string, unknown>;
      const driverId = String(r[idKey] ?? '').trim().toLowerCase();
      if (!driverId) continue;
      const online = parseUberDaysHoursMinutes(r[onlineKey]);
      const onTrip = parseUberDaysHoursMinutes(r[onTripKey]);
      if (online === null || onTrip === null) continue;
      const name = [firstKey ? r[firstKey] : '', lastKey ? r[lastKey] : '']
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)
        .join(' ');
      out.set(driverId, {
        driverId,
        name: name || driverId,
        tripsCompleted: tripsKey ? Number.parseInt(String(r[tripsKey] ?? '0'), 10) || 0 : 0,
        onlineHours: online,
        onTripHours: onTrip,
      });
    }
  }
  return [...out.values()];
}
