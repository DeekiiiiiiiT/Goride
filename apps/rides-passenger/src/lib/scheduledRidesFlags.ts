/** Client flag for scheduled/reserve rides (`VITE_SCHEDULED_RIDES=1`). Default OFF when unset. */
export function isScheduledRidesEnabled(): boolean {
  const v = import.meta.env.VITE_SCHEDULED_RIDES;
  return v === '1' || v === 'true';
}
