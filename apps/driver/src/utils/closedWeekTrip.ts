/** Shown when a driver logs a trip into a week the office already closed. */
export const CLOSED_WEEK_TRIP_MESSAGE =
  'That pay week is closed, so this trip cannot be changed. Change the date to an open week, or ask the office.';

export function isClosedWeekSaveError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /pay week is closed/i.test(msg);
}

export function closedWeekSaveError(): Error & { code: string } {
  const err = new Error(CLOSED_WEEK_TRIP_MESSAGE) as Error & { code: string };
  err.code = 'CLOSED_WEEK';
  return err;
}
