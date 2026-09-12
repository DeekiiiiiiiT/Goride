/**
 * Server-honored toll ledger sort keys (R-01).
 * Keep in sync with apps/fleet/src/utils/tollSortKeys.ts
 */
export const TOLL_SORT_MAP: Record<string, string> = {
  date: "date",
  amount: "amount",
  plaza: "plaza",
  type: "type",
  status: "status",
  id: "id",
  vehicleId: "vehicle_id",
  driverId: "driver_id",
  // UI aliases that map to typed / payload columns
  vehiclePlate: "payload_json->>vehiclePlate",
  driverName: "payload_json->>driverName",
  paymentMethod: "payment_method",
};

export function resolveTollSort(
  sortKey: unknown,
  sortDir: unknown,
): { appliedKey: string; sqlCol: string; ascending: boolean } {
  const raw = String(sortKey || "").trim();
  // absAmount / reconciliationStatus are derived — not sortable server-side yet
  if (raw === "absAmount" || raw === "reconciliationStatus") {
    return { appliedKey: "date", sqlCol: "date", ascending: false };
  }
  const sqlCol = TOLL_SORT_MAP[raw] || TOLL_SORT_MAP.date;
  const appliedKey = TOLL_SORT_MAP[raw] ? raw : "date";
  const ascending = String(sortDir || "").toLowerCase() === "asc";
  return { appliedKey, sqlCol, ascending };
}

/** Map UI reconciliationStatus chip → SQL filters on typed columns. */
export function reconciliationStatusFilters(
  status: string,
): import("./repos/baseRepo.ts").FleetQueryFilter[] {
  switch (status) {
    case "Matched":
      // trip_id present and non-empty (empty string = unmatched/dismissed intent)
      return [
        { op: "eq", col: "is_reconciled", value: true },
        { op: "not", col: "trip_id", operator: "is", value: null },
        { op: "neq", col: "trip_id", value: "" },
      ];
    case "Dismissed":
      return [
        { op: "eq", col: "is_reconciled", value: true },
        { op: "or", value: "trip_id.is.null,trip_id.eq." },
      ];
    case "Approved":
      return [
        { op: "eq", col: "status", value: "Approved" },
        { op: "or", value: "is_reconciled.is.null,is_reconciled.eq.false" },
      ];
    case "Unmatched":
      return [
        { op: "or", value: "is_reconciled.is.null,is_reconciled.eq.false" },
        { op: "or", value: "status.is.null,status.neq.Approved" },
      ];
    default:
      return [];
  }
}
