/**
 * H3 Geo Index Helpers
 *
 * Provides H3 hexagonal spatial indexing for driver supply and surge cells.
 * Uses h3-js library for computing cell indices and k-rings.
 *
 * Resolution guide:
 * - 7: ~1.2km edge, good for urban areas
 * - 8: ~460m edge, more precise but more cells to query
 * - 9: ~175m edge, very precise, many cells
 *
 * Default resolution: 7 (configurable in matching.policies)
 */

// Import h3-js from esm.sh
import * as h3 from "https://esm.sh/h3-js@4.1.0";

export const DEFAULT_H3_RESOLUTION = 7;

/**
 * Convert lat/lng to H3 cell index at given resolution.
 */
export function latLngToH3(lat: number, lng: number, resolution = DEFAULT_H3_RESOLUTION): string {
  return h3.latLngToCell(lat, lng, resolution);
}

/**
 * Get the center lat/lng of an H3 cell.
 */
export function h3ToLatLng(h3Index: string): { lat: number; lng: number } {
  const [lat, lng] = h3.cellToLatLng(h3Index);
  return { lat, lng };
}

/**
 * Get a disk of H3 cells around a center point.
 * k=0 returns just the center cell.
 * k=1 returns center + 6 surrounding cells.
 * k=2 returns center + 18 surrounding cells (2 rings).
 *
 * @param lat Center latitude
 * @param lng Center longitude
 * @param k Ring count (0 = just center)
 * @param resolution H3 resolution
 * @returns Array of H3 cell indices
 */
export function h3Disk(
  lat: number,
  lng: number,
  k: number,
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  const centerCell = latLngToH3(lat, lng, resolution);
  return h3.gridDisk(centerCell, k);
}

/**
 * Get k-ring (hollow ring) of H3 cells at distance k from center.
 *
 * @param lat Center latitude
 * @param lng Center longitude
 * @param k Ring distance
 * @param resolution H3 resolution
 * @returns Array of H3 cell indices forming the ring
 */
export function h3Ring(
  lat: number,
  lng: number,
  k: number,
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  const centerCell = latLngToH3(lat, lng, resolution);
  return h3.gridRingUnsafe(centerCell, k);
}

/**
 * Estimate k-ring value for a target radius in km.
 * This is approximate - actual coverage depends on H3 resolution and location.
 *
 * At resolution 7:
 * - k=0: ~0km (center cell only)
 * - k=1: ~1.2km radius
 * - k=2: ~2.4km radius
 * - k=3: ~3.6km radius
 * - k=4: ~4.8km radius
 * - k=5: ~6km radius
 *
 * Formula: k ≈ radius_km / (edge_km * sqrt(3))
 */
export function kRingForRadiusKm(
  radiusKm: number,
  resolution = DEFAULT_H3_RESOLUTION,
): number {
  // Edge lengths by resolution (approximate, in km)
  const edgeLengths: Record<number, number> = {
    4: 22.6,
    5: 8.5,
    6: 3.2,
    7: 1.22,
    8: 0.46,
    9: 0.17,
    10: 0.065,
  };

  const edgeKm = edgeLengths[resolution] ?? 1.22;
  const factor = edgeKm * Math.sqrt(3); // Approximate cell width

  return Math.max(0, Math.ceil(radiusKm / factor));
}

/**
 * Get calibrated k-ring values for wave radii.
 * Uses policy-defined k-rings or computes from radii.
 *
 * @param waveRadiiKm Array of wave radii in km
 * @param policyKRings Optional pre-calibrated k-rings from policy
 * @param resolution H3 resolution
 * @returns Array of k values per wave
 */
export function getWaveKRings(
  waveRadiiKm: number[],
  policyKRings?: number[],
  resolution = DEFAULT_H3_RESOLUTION,
): number[] {
  if (policyKRings && policyKRings.length >= waveRadiiKm.length) {
    return policyKRings.slice(0, waveRadiiKm.length);
  }

  // Compute from radii
  return waveRadiiKm.map((r) => kRingForRadiusKm(r, resolution));
}

/**
 * Get H3 cells for a matching wave.
 *
 * @param lat Pickup latitude
 * @param lng Pickup longitude
 * @param wave Wave number (1-based)
 * @param waveKRings Array of k-ring values per wave
 * @param resolution H3 resolution
 * @returns Array of H3 cell indices to query
 */
export function getCellsForWave(
  lat: number,
  lng: number,
  wave: number,
  waveKRings: number[],
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  const waveIdx = Math.max(0, Math.min(wave - 1, waveKRings.length - 1));
  const k = waveKRings[waveIdx] ?? 0;
  return h3Disk(lat, lng, k, resolution);
}

/**
 * Check if H3 supply is enabled.
 * Requires both env flag and policy setting.
 */
export function isH3SupplyEnabled(
  policyEnabled: boolean,
): boolean {
  if (Deno.env.get("MATCHING_H3_SUPPLY") !== "1") return false;
  return policyEnabled;
}

// -----------------------------------------------------------------------------
// Jamaica calibration data (Phase 4)
// These values should be verified with real driver data
// -----------------------------------------------------------------------------

/**
 * Jamaica calibration constants for H3 at resolution 7.
 * Kingston coordinates: 17.9714, -76.7932
 *
 * Wave radii: [5, 15, 35] km
 * Calibrated k-rings: [4, 13, 29]
 *
 * Verification needed:
 * - Print k-ring coverage at Kingston coords
 * - Verify actual km coverage vs target
 */
export const JAMAICA_CALIBRATION = {
  resolution: 7,
  referencePoint: { lat: 17.9714, lng: -76.7932 }, // Kingston
  waveRadiiKm: [5, 15, 35],
  calibratedKRings: [4, 13, 29],
};

/**
 * Get calibration data for a market.
 * Currently only Jamaica is calibrated.
 */
export function getCalibrationForMarket(
  _marketCode: string,
): typeof JAMAICA_CALIBRATION | null {
  // Future: Add more markets
  return JAMAICA_CALIBRATION;
}
