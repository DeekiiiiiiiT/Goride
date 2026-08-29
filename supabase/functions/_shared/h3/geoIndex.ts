/**
 * H3 Geo Index Helpers (Deno mirror of @roam/spatial).
 * Keep in sync with packages/spatial/src/index.ts — same API surface.
 */

import * as h3 from "npm:h3-js@4.1.0";

export const DEFAULT_H3_RESOLUTION = 7;
export const COMPILE_H3_RESOLUTIONS = [7, 8] as const;

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

export function latLngToH3(lat: number, lng: number, resolution = DEFAULT_H3_RESOLUTION): string {
  return h3.latLngToCell(lat, lng, resolution);
}

export function h3ToLatLng(h3Index: string): LatLng {
  const [lat, lng] = h3.cellToLatLng(h3Index);
  return { lat, lng };
}

export function h3Disk(
  lat: number,
  lng: number,
  k: number,
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  const centerCell = latLngToH3(lat, lng, resolution);
  return h3.gridDisk(centerCell, Math.max(0, k));
}

export function h3DiskFromCell(h3Index: string, k: number): string[] {
  return h3.gridDisk(h3Index, Math.max(0, k));
}

/** Deprecated unsafe ring — prefer h3Disk. Kept for callers; uses safe gridDisk hollow via disk diff. */
export function h3Ring(
  lat: number,
  lng: number,
  k: number,
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  if (k <= 0) return [latLngToH3(lat, lng, resolution)];
  const outer = h3Disk(lat, lng, k, resolution);
  const inner = new Set(h3Disk(lat, lng, k - 1, resolution));
  return outer.filter((c) => !inner.has(c));
}

export function kRingForRadiusKm(
  radiusKm: number,
  resolution = DEFAULT_H3_RESOLUTION,
): number {
  const edgeKm = H3_EDGE_KM[resolution] ?? 1.22;
  const centerSpacingKm = edgeKm * Math.sqrt(3);
  return Math.max(0, Math.ceil(radiusKm / centerSpacingKm));
}

export function kRingForRadiusKmWithMargin(
  radiusKm: number,
  resolution = DEFAULT_H3_RESOLUTION,
  marginRings = 1,
): number {
  return kRingForRadiusKm(radiusKm, resolution) + Math.max(0, marginRings);
}

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

export type CoverageKind = "include" | "exclude";

export function polygonToH3Cells(
  polygon: LatLng[],
  resolution: number,
  _kind: CoverageKind,
): string[] {
  if (polygon.length < 3) return [];
  const ring: [number, number][] = polygon.map((p) => [p.lat, p.lng]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  const cells = new Set<string>(h3.polygonToCells(ring, resolution));
  for (const [lat, lng] of ring) {
    try {
      cells.add(latLngToH3(lat, lng, resolution));
    } catch {
      /* skip */
    }
  }
  return [...cells];
}

export function cellBoundary(h3Index: string): LatLng[] {
  return h3.cellToBoundary(h3Index).map(([lat, lng]: [number, number]) => ({ lat, lng }));
}

/** @deprecated Hand-tuned rings were wrong; use getWaveKRings(radii, null). */
export const JAMAICA_CALIBRATION = {
  resolution: 7,
  referencePoint: { lat: 17.9714, lng: -76.7932 },
  waveRadiiKm: [5, 15, 35],
  /** Derived via kRingForRadiusKmWithMargin — not radius/edge. */
  calibratedKRings: [4, 9, 18] as number[],
};

export function getCalibrationForMarket(_marketCode: string): typeof JAMAICA_CALIBRATION | null {
  return JAMAICA_CALIBRATION;
}

export function isH3SupplyEnabled(policyEnabled: boolean): boolean {
  if (Deno.env.get("MATCHING_H3_SUPPLY") !== "1") return false;
  return policyEnabled;
}

export function isMatchingH3SupplyEnabled(policyEnabled: boolean): boolean {
  return isH3SupplyEnabled(policyEnabled);
}

export function isMatchingH3SurgeEnabled(policyEnabled: boolean): boolean {
  if (Deno.env.get("MATCHING_H3_SURGE") !== "1") return false;
  return policyEnabled;
}

export function isRushH3DispatchEnabled(): boolean {
  return Deno.env.get("RUSH_H3_DISPATCH_ENABLED") === "1";
}

/** Hex coverage is live by default; set RUSH_HEX_COVERAGE_ENABLED=0 only to kill-switch back to polygons. */
export function isRushHexCoverageEnabled(): boolean {
  return Deno.env.get("RUSH_HEX_COVERAGE_ENABLED") !== "0";
}
