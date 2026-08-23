/** Leaflet-safe latitude/longitude (WGS84). */
export function isValidMapCoord(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lng);
  return Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180
    && !(la === 0 && lo === 0);
}

export function toRoutePoint(
  lat: unknown,
  lon: unknown,
  timestamp: number,
): { lat: number; lon: number; timestamp: number } | null {
  if (!isValidMapCoord(lat, lon)) return null;
  return { lat: Number(lat), lon: Number(lon), timestamp };
}
