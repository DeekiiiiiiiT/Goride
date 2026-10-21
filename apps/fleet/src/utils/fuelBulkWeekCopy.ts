import { format, parseISO } from 'date-fns';

/** Soft cap — keeps bulk under edge timeout risk (one week per API cycle). */
export const FUEL_BULK_FINALIZE_MAX_WEEKS = 8;

/** Same soft cap for bulk reset of finalized weeks. */
export const FUEL_BULK_RESET_MAX_WEEKS = 8;

export function formatFuelBulkProgress(done: number, total: number, label: string): string {
  return `Finalizing ${label} (${done}/${total})…`;
}

export function formatFuelBulkResetProgress(done: number, total: number, label: string): string {
  return `Reopening ${label} (${done}/${total})…`;
}

export function fuelBulkConfirmPhrase(count: number): string {
  return `FINALIZE ${count} WEEKS`;
}

export function fuelBulkResetConfirmPhrase(count: number): string {
  return `REOPEN ${count} WEEKS`;
}

/** Used only for labels in tests / dialogs. */
export function fuelWeekLabelFromYmd(weekStartYmd: string, weekEndYmd: string): string {
  try {
    return `${format(parseISO(`${weekStartYmd}T12:00:00`), 'MMM d')} – ${format(parseISO(`${weekEndYmd}T12:00:00`), 'MMM d, yyyy')}`;
  } catch {
    return `${weekStartYmd} – ${weekEndYmd}`;
  }
}
