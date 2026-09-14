/**
 * Client mirror of toll server sort whitelist (R-01).
 * Keep in sync with supabase/functions/_fleet-server/toll_sort.ts
 */
export const TOLL_SERVER_SORT_KEYS = [
  'date',
  'amount',
  'plaza',
  'type',
  'status',
  'id',
  'vehicleId',
  'driverId',
  'vehiclePlate',
  'driverName',
  'paymentMethod',
] as const;

const SET = new Set<string>(TOLL_SERVER_SORT_KEYS);

export function isTollServerSortKey(key: string): boolean {
  return SET.has(key);
}
