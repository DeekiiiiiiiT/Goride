/** Earth-surface distance in km (Haversine). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough urban ETA: ~3 min/km + 5 min base. */
export function estimateEtaMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 5;
  return Math.max(5, Math.round(distanceKm * 3 + 5));
}

export function roundKm(km: number, digits = 1): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  const f = 10 ** digits;
  return Math.round(km * f) / f;
}
