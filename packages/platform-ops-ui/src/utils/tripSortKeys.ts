/**
 * Client mirror of server trip sort whitelist (N-03).
 * Keep in sync with supabase/functions/_fleet-server/trip_sort.ts
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

export function isTripServerSortKey(key: string): boolean {
  return SET.has(key);
}

export function toTripApiSortKey(uiKey: string): string {
  if (uiKey === 'driver') return 'driverName';
  if (uiKey === 'tripDate') return 'date';
  return uiKey;
}
