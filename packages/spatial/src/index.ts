/**
 * @roam/spatial — shared H3 cell math for Rides + Rush.
 * Keep Deno mirror in sync: supabase/functions/_shared/h3/geoIndex.ts
 */

import {
  cellToBoundary,
  cellToLatLng,
  gridDisk,
  latLngToCell,
  polygonToCells,
} from 'h3-js';

type DenoEnv = { env: { get(key: string): string | undefined } };
const denoGlobal = (globalThis as { Deno?: DenoEnv }).Deno;

function envFlag(key: string): string | undefined {
  return denoGlobal?.env.get(key);
}

export const DEFAULT_H3_RESOLUTION = 7;
export const COMPILE_H3_RESOLUTIONS = [7, 8] as const;

/** Approximate edge length (km) by H3 resolution. */
export const H3_EDGE_KM: Record<number, number> = {
  4: 22.6,
  5: 8.5,
  6: 3.2,
  7: 1.22,
  8: 0.46,
  9: 0.17,
  10: 0.065,
};

export type LatLng = { lat: number; lng: number };

export function latLngToH3(
  lat: number,
  lng: number,
  resolution = DEFAULT_H3_RESOLUTION,
): string {
  return latLngToCell(lat, lng, resolution);
}

export function h3ToLatLng(h3Index: string): LatLng {
  const [lat, lng] = cellToLatLng(h3Index);
  return { lat, lng };
}

export function h3Disk(
  lat: number,
  lng: number,
  k: number,
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  const center = latLngToH3(lat, lng, resolution);
  return gridDisk(center, Math.max(0, k));
}

export function h3DiskFromCell(h3Index: string, k: number): string[] {
  return gridDisk(h3Index, Math.max(0, k));
}

/**
 * k such that a k-disk covers ~radiusKm (center spacing ≈ edge × √3).
 * Callers should add +1 for over-fetch when filtering candidates.
 */
export function kRingForRadiusKm(
  radiusKm: number,
  resolution = DEFAULT_H3_RESOLUTION,
): number {
  const edgeKm = H3_EDGE_KM[resolution] ?? 1.22;
  const centerSpacingKm = edgeKm * Math.sqrt(3);
  return Math.max(0, Math.ceil(radiusKm / centerSpacingKm));
}

/** Candidate filter k: derived radius coverage + one ring over-fetch. */
export function kRingForRadiusKmWithMargin(
  radiusKm: number,
  resolution = DEFAULT_H3_RESOLUTION,
  marginRings = 1,
): number {
  return kRingForRadiusKm(radiusKm, resolution) + Math.max(0, marginRings);
}

/**
 * Derive wave k-rings from radii. Optional policy override only when non-empty;
 * empty/null means derive (preferred).
 */
export function getWaveKRings(
  waveRadiiKm: number[],
  policyKRings?: number[] | null,
  resolution = DEFAULT_H3_RESOLUTION,
): number[] {
  if (policyKRings && policyKRings.length >= waveRadiiKm.length) {
    return policyKRings.slice(0, waveRadiiKm.length);
  }
  return waveRadiiKm.map((r) => kRingForRadiusKmWithMargin(r, resolution));
}

export function getCellsForWave(
  lat: number,
  lng: number,
  wave: number,
  waveRadiiKm: number[],
  policyKRings?: number[] | null,
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  const rings = getWaveKRings(waveRadiiKm, policyKRings, resolution);
  const waveIdx = Math.max(0, Math.min(wave - 1, rings.length - 1));
  const k = rings[waveIdx] ?? 0;
  return h3Disk(lat, lng, k, resolution);
}

export type CoverageKind = 'include' | 'exclude';

/**
 * ADR 0013 boundary policy:
 * - include: keep all intersecting cells (generous)
 * - exclude: keep all intersecting cells (conservative no-go)
 * polygonToCells already fills cells whose centroid is inside; we also add
 * cells that touch the boundary via a small buffer disk on ring vertices.
 */
export function polygonToH3Cells(
  polygon: LatLng[],
  resolution: number,
  kind: CoverageKind,
): string[] {
  if (polygon.length < 3) return [];
  const ring: [number, number][] = polygon.map((p) => [p.lat, p.lng]);
  // Close ring if needed
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  const cells = new Set<string>(polygonToCells(ring, resolution));

  // Edge hexes: stamp vertices so boundary-straddling hexes are included
  // for both include (generous) and exclude (conservative).
  for (const [lat, lng] of ring) {
    try {
      cells.add(latLngToH3(lat, lng, resolution));
    } catch {
      /* skip invalid vertex */
    }
  }

  void kind; // policy identical for fill set; callers interpret include vs exclude
  return [...cells];
}

export function cellBoundary(h3Index: string): LatLng[] {
  return cellToBoundary(h3Index).map(([lat, lng]) => ({ lat, lng }));
}

export const JAMAICA_REFERENCE = {
  resolution: DEFAULT_H3_RESOLUTION,
  referencePoint: { lat: 17.9714, lng: -76.7932 },
  waveRadiiKm: [5, 15, 35] as number[],
};

/** Derived k-rings for Jamaica wave radii (not hand-tuned). */
export function jamaicaDerivedKRings(): number[] {
  return getWaveKRings(JAMAICA_REFERENCE.waveRadiiKm, null, JAMAICA_REFERENCE.resolution);
}

export function isMatchingH3SupplyEnabled(policyEnabled: boolean): boolean {
  // On Deno edge, require MATCHING_H3_SUPPLY=1; in browser/Node honor policy only.
  if (denoGlobal && envFlag('MATCHING_H3_SUPPLY') !== '1') return false;
  return policyEnabled;
}

/** Alias kept in sync with Deno geoIndex.isH3SupplyEnabled */
export function isH3SupplyEnabled(policyEnabled: boolean): boolean {
  return isMatchingH3SupplyEnabled(policyEnabled);
}

export function isMatchingH3SurgeEnabled(policyEnabled: boolean): boolean {
  if (denoGlobal && envFlag('MATCHING_H3_SURGE') !== '1') return false;
  return policyEnabled;
}

export function isRushH3DispatchEnabled(): boolean {
  return envFlag('RUSH_H3_DISPATCH_ENABLED') === '1';
}

export function isRushHexCoverageEnabled(): boolean {
  return envFlag('RUSH_HEX_COVERAGE_ENABLED') === '1';
}
