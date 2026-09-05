/**
 * Scheduled fuel-log export helpers.
 *
 * Intended for a future cron / edge job that dumps the prior completed
 * Mon–Sun week as CSV. Call from a scheduler roughly:
 *
 *   const { start, end } = priorCompletedWeekRange(new Date());
 *   const entries = await fetchFuelEntries({ startDate: start, endDate: end });
 *   const rows = buildScheduledFuelExportRows(entries, getVehicleName, getDriverName);
 *   // then upload / email `rows` as CSV
 */

import type { FuelEntry } from '../types/fuel';
import { resolveFuelEntrySource } from './fuelEntrySource';

export type ScheduledFuelExportRow = {
  date: string;
  time: string;
  vehicle: string;
  driver: string;
  station: string;
  liters: number | '';
  amount: number | '';
  odometer: number | '';
  entrySource: string;
  cycleId: string;
  notes: string;
};

/**
 * Prior completed Mon–Sun week in local calendar dates (yyyy-MM-dd).
 * `anchor` defaults to now; week ends on the Sunday before the current week.
 */
export function priorCompletedWeekRange(anchor: Date = new Date()): {
  start: string;
  end: string;
} {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  // JS: Sunday = 0 … Monday = 1
  const day = d.getDay();
  // Days since last Monday of the *previous* completed week
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  // End = Sunday of prior week = today - daysSinceMonday - 1
  const end = new Date(d);
  end.setDate(d.getDate() - daysSinceMonday - 1);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const ymd = (x: Date) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  return { start: ymd(start), end: ymd(end) };
}

/** Build flat export rows for a scheduled dump (no Blob/download — cron-friendly). */
export function buildScheduledFuelExportRows(
  entries: FuelEntry[],
  getVehicleName: (id?: string) => string,
  getDriverName: (id?: string) => string,
): ScheduledFuelExportRow[] {
  return (entries || []).map((e) => ({
    date: String(e.date || '').slice(0, 10),
    time: e.time || '',
    vehicle: getVehicleName(e.vehicleId),
    driver: getDriverName(e.driverId),
    station: e.location || e.vendor || '',
    liters: e.liters ?? '',
    amount: e.amount ?? '',
    odometer: e.odometer ?? '',
    entrySource: resolveFuelEntrySource(e),
    cycleId: String(e.metadata?.cycleId || ''),
    notes: e.notes || '',
  }));
}
