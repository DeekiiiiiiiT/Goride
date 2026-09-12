/**
 * Client mirror of server trip sort whitelist (N-03).
 * Keep in sync with supabase/functions/_fleet-server/trip_sort.ts
 * F-26: distance/duration re-added once typed numeric columns exist.
 */
export const TRIP_SERVER_SORT_KEYS = [
  'id',
  'date',
  'tripDate',
  'amount',
  'status',
  'platform',
  'driver',
  'driverName',
  'distance',
  'duration',
] as const;

const SET = new Set<string>(TRIP_SERVER_SORT_KEYS);

/** UI column keys the server will honor for full-set sort. */
export function isTripServerSortKey(key: string): boolean {
  return SET.has(key);
}

/** Normalize UI key → API sortKey. */
export function toTripApiSortKey(uiKey: string): string {
  if (uiKey === 'driver') return 'driverName';
  if (uiKey === 'tripDate') return 'date';
  return uiKey;
}
