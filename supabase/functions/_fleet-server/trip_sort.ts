/**
 * Server-honored trip sort keys for /trips/search (N-03 / F-03).
 * Keep in sync with apps/fleet/src/utils/tripSortKeys.ts
 * F-26: distance/duration are typed numeric columns (not value->> text).
 */
export const TRIP_SORT_MAP: Record<string, string> = {
  date: "value->>date",
  tripDate: "value->>date",
  amount: "amount",
  status: "value->>status",
  platform: "value->>platform",
  id: "id",
  driverName: "value->>driverName",
  driver: "value->>driverName",
  distance: "distance",
  duration: "duration",
};

export const TRIP_SORT_KEYS = Object.keys(TRIP_SORT_MAP);

export function resolveTripSort(
  sortKey: unknown,
  sortDir: unknown,
): { appliedKey: string; sqlCol: string; ascending: boolean } {
  const raw = String(sortKey || "").trim();
  const sqlCol = TRIP_SORT_MAP[raw] || TRIP_SORT_MAP.date;
  const appliedKey = TRIP_SORT_MAP[raw]
    ? (raw === "tripDate" ? "date" : raw === "driver" ? "driverName" : raw)
    : "date";
  const ascending = String(sortDir || "").toLowerCase() === "asc";
  return { appliedKey, sqlCol, ascending };
}
