/**
 * Server-honored fuel ledger sort keys (R-01).
 * Keep in sync with apps/fleet/src/utils/fuelSortKeys.ts
 * Only typed / snake_case fleet.fuel_entries columns.
 */
export const FUEL_SORT_MAP: Record<string, string> = {
  date: "date",
  amount: "amount",
  liters: "liters",
  odometer: "odometer",
  vehicleId: "vehicle_id",
  driverId: "driver_id",
  paymentSource: "payment_source",
  entryMode: "entry_mode",
  type: "type",
  auditStatus: "audit_status",
  id: "id",
  pricePerLiter: "price_per_liter",
};

export function resolveFuelSort(
  sortKey: unknown,
  sortDir: unknown,
): { appliedKey: string; sqlCol: string; ascending: boolean } {
  const raw = String(sortKey || "").trim();
  const sqlCol = FUEL_SORT_MAP[raw] || FUEL_SORT_MAP.date;
  const appliedKey = FUEL_SORT_MAP[raw] ? raw : "date";
  const ascending = String(sortDir || "").toLowerCase() === "asc";
  return { appliedKey, sqlCol, ascending };
}
