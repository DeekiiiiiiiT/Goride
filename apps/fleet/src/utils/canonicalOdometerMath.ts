/** Pure math for combining KV metrics with per-vehicle max manual/fuel supplements (km). */

export type OdometerSupplementMaps = {
  manualMaxByVehicleId: Map<string, number>;
  fuelMaxByVehicleId: Map<string, number>;
};

export function parseNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function canonicalOdometerFromMaps(
  vehicleId: string,
  metricsFallback: number,
  maps: OdometerSupplementMaps,
): number {
  const base = parseNum(metricsFallback);
  const m = maps.manualMaxByVehicleId.get(vehicleId) ?? 0;
  const f = maps.fuelMaxByVehicleId.get(vehicleId) ?? 0;
  return Math.max(base, m, f);
}