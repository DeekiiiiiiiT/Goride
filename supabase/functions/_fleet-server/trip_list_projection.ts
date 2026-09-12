/**
 * F-20 — whitelist projection for trip list payloads.
 * Prefer keeping only UI/filter/sort fields over blacklist-stripping huge blobs.
 */
const TRIP_LIST_KEEP = new Set([
  "id",
  "date",
  "requestTime",
  "dropoffTime",
  "platform",
  "status",
  "serviceType",
  "productType",
  "serviceCategory",
  "serviceLine",
  "driverId",
  "driverName",
  "vehicleId",
  "vehiclePlate",
  "organizationId",
  "pickupLocation",
  "dropoffLocation",
  "pickupArea",
  "dropoffArea",
  "distance",
  "duration",
  "amount",
  "netToDriver",
  "fare",
  "tips",
  "tolls",
  "paymentMethod",
  "isManual",
  "anchorPeriodId",
  "tripType",
  "currency",
]);

export function projectTripListValue(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const v = raw && typeof raw === "object" ? raw : {};
  const out: Record<string, unknown> = {};
  for (const key of TRIP_LIST_KEEP) {
    if (key in v) out[key] = v[key as keyof typeof v];
  }
  // Always retain id/date if present under alternate shapes
  if (out.id == null && (v as any).id != null) out.id = (v as any).id;
  if (out.date == null && (v as any).date != null) out.date = (v as any).date;
  if (out.platform === "GoRide") out.platform = "Roam";
  return out;
}
