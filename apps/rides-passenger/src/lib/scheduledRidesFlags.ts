/** Optional client flag (`VITE_SCHEDULED_RIDES=1`) for dev-only UI toggles. Server flag is authoritative. */
export function isScheduledRidesEnabled(): boolean {
  const v = import.meta.env.VITE_SCHEDULED_RIDES;
  if (v === undefined || v === '') return true;
  return v === '1' || v === 'true';
}
