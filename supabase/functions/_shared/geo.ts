/** Deno copy of packages/types/src/geo.ts */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371008.8;

export function distanceMeters(a: LatLng, b: LatLng): number {
  if (
    !Number.isFinite(a.lat) || !Number.isFinite(a.lng) ||
    !Number.isFinite(b.lat) || !Number.isFinite(b.lng)
  ) {
    return Infinity;
  }
  if (a.lat === b.lat && a.lng === b.lng) return 0;

  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lng - a.lng) * toRad;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isInsideGeofence(
  point: LatLng,
  center: LatLng,
  radiusM: number,
  accuracyBufferM = 0,
): { isInside: boolean; distanceM: number; effectiveRadiusM: number } {
  const effectiveRadiusM = radiusM + Math.max(0, accuracyBufferM);
  const distanceM = distanceMeters(point, center);
  return {
    isInside: distanceM <= effectiveRadiusM,
    distanceM,
    effectiveRadiusM,
  };
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLon = (b.lng - a.lng) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}
