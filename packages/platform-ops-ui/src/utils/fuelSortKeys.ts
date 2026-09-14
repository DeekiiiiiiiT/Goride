/**
 * Client mirror of fuel server sort whitelist (R-01).
 * Keep in sync with supabase/functions/_fleet-server/fuel_sort.ts
 */
export const FUEL_SERVER_SORT_KEYS = [
  'date',
  'amount',
  'liters',
  'odometer',
  'vehicleId',
  'driverId',
  'paymentSource',
  'entryMode',
  'type',
  'auditStatus',
  'id',
  'pricePerLiter',
] as const;

const SET = new Set<string>(FUEL_SERVER_SORT_KEYS);

export function isFuelServerSortKey(key: string): boolean {
  return SET.has(key);
}
