/** Leaflet-safe latitude/longitude (WGS84). */
export function isValidMapCoord(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lng);
  return (
    Number.isFinite(la) &&
    Number.isFinite(lo) &&
    Math.abs(la) <= 90 &&
    Math.abs(lo) <= 180 &&
    !(la === 0 && lo === 0)
  );
}
