import type { HaulageFreightItem, HaulagePlace } from './types';

const BASE_FEE_MINOR = 2500;
const PER_KG_MINOR = 45;
const PER_KM_MINOR = 120;
const FRAGILE_SURCHARGE_MINOR = 1500;
const DISASSEMBLY_SURCHARGE_MINOR = 2000;

function haversineKm(a: HaulagePlace, b: HaulagePlace): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Stub pricing until haulage quote API exists. */
export function estimateHaulageTotalMinor(
  items: HaulageFreightItem[],
  pickup: HaulagePlace | null,
  dropoff: HaulagePlace | null,
): { totalMinor: number; distanceKm: number | null } {
  const totalWeight = items.reduce((sum, item) => sum + item.weightKg, 0);
  const surcharges = items.reduce(
    (sum, item) =>
      sum +
      (item.fragile ? FRAGILE_SURCHARGE_MINOR : 0) +
      (item.requiresDisassembly ? DISASSEMBLY_SURCHARGE_MINOR : 0),
    0,
  );

  let distanceKm: number | null = null;
  let distanceMinor = 0;
  if (pickup && dropoff) {
    distanceKm = Math.round(haversineKm(pickup, dropoff) * 10) / 10;
    distanceMinor = Math.round(distanceKm * PER_KM_MINOR);
  }

  const totalMinor =
    BASE_FEE_MINOR +
    Math.round(totalWeight * PER_KG_MINOR) +
    surcharges +
    distanceMinor;

  return { totalMinor, distanceKm };
}

export function estimateDurationMinutes(distanceKm: number | null): number | null {
  if (distanceKm == null) return null;
  return Math.max(15, Math.round((distanceKm / 35) * 60));
}
