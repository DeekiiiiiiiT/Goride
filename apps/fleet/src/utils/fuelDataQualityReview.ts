/**
 * Cash-desk data-quality vehicle reviews — Continue blocked until flagged vehicles are marked.
 * Pending-only fills stay informational (post on Finalize).
 */

export type FuelDataQualityVehicleReview = {
  vehicleId: string;
  at: string;
  by?: string | null;
  note?: string | null;
};

export function isFuelDataQualityFlagged(v: {
  healthStatus?: string | null;
  odometerIncomplete?: boolean;
}): boolean {
  const unhealthy = Boolean(v.healthStatus && v.healthStatus !== 'Emerald');
  return unhealthy || Boolean(v.odometerIncomplete);
}

export function reviewedVehicleIdSet(
  reviews: FuelDataQualityVehicleReview[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const r of reviews || []) {
    const id = String(r?.vehicleId || '').trim();
    if (id) out.add(id);
  }
  return out;
}

export function parseDataQualityVehicleReviews(raw: unknown): FuelDataQualityVehicleReview[] {
  if (!Array.isArray(raw)) return [];
  const out: FuelDataQualityVehicleReview[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const vehicleId = String(row.vehicleId || row.vehicle_id || '').trim();
    if (!vehicleId) continue;
    out.push({
      vehicleId,
      at: String(row.at || row.reviewedAt || new Date().toISOString()),
      by: row.by != null ? String(row.by) : row.reviewedBy != null ? String(row.reviewedBy) : null,
      note: row.note != null ? String(row.note) : null,
    });
  }
  return out;
}

/** Merge one vehicle review into the list (upsert by vehicleId). */
export function upsertDataQualityVehicleReview(
  existing: FuelDataQualityVehicleReview[],
  next: FuelDataQualityVehicleReview,
): FuelDataQualityVehicleReview[] {
  const id = String(next.vehicleId || '').trim();
  if (!id) return existing;
  const rest = existing.filter((r) => r.vehicleId !== id);
  return [...rest, { ...next, vehicleId: id }];
}
