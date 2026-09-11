/**
 * Pure week-scope + bundle gates for Close Week Uber cash refresh (no I/O).
 */
import { addDays, format, parseISO } from 'date-fns';
import type { FileData } from './csvHelpers';

export function weekEndYmd(weekKey: string): string {
  return format(addDays(parseISO(`${weekKey.slice(0, 10)}T12:00:00`), 6), 'yyyy-MM-dd');
}

export function tripYmd(trip: { date?: string; completed_at?: string }): string {
  const raw = String(trip.date || trip.completed_at || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

export function isYmdInWeek(ymd: string, weekKey: string): boolean {
  if (!ymd || !weekKey) return false;
  const start = weekKey.slice(0, 10);
  const end = weekEndYmd(start);
  return ymd >= start && ymd <= end;
}

export function assertUberCashRefreshBundle(uberFiles: FileData[]): void {
  const hasDriver = uberFiles.some((f) => f.type === 'uber_payment_driver');
  const hasTxOrTrip = uberFiles.some(
    (f) => f.type === 'uber_payment' || f.type === 'uber_trip',
  );
  if (!hasDriver || !hasTxOrTrip) {
    throw new Error(
      'Need both payments_driver (statement cash) and payments_transaction or trip_activity (trip cash).',
    );
  }
}
