/** Shared toll plaza proximity checks (live GPS + route estimate). */
import { distanceMeters, type LatLng } from "./geo.ts";

export interface TollPlazaGeo {
  id: string;
  name: string;
  location: LatLng;
  geofenceRadius: number;
  defaultRateMinor: number;
  currency: string;
}

/** Point within plaza geofence (uses plaza radius when > 0). */
export function isPointNearPlaza(
  point: LatLng,
  plaza: TollPlazaGeo,
  fallbackRadiusM: number,
): boolean {
  if (!(plaza.defaultRateMinor > 0)) return false;
  const effectiveRadius = plaza.geofenceRadius > 0 ? plaza.geofenceRadius : fallbackRadiusM;
  return distanceMeters(point, plaza.location) <= effectiveRadius;
}

/** Any route point within plaza geofence (v1: one count per plaza). */
export function routeCrossesPlaza(
  routePoints: LatLng[],
  plaza: TollPlazaGeo,
  fallbackRadiusM: number,
): boolean {
  if (routePoints.length === 0) return false;
  for (const point of routePoints) {
    if (isPointNearPlaza(point, plaza, fallbackRadiusM)) return true;
  }
  return false;
}
