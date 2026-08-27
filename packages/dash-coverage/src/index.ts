export type {
  CoverageVertex,
  CoverageRing,
  CoveragePolygonPart,
  CoverageMultiPolygon,
} from './geometry.ts';
export {
  MAX_EDITABLE_VERTICES,
  dropClosingVertex,
  ringVertexCount,
  pointInRing,
  pointInMultiPolygon,
  multiPolygonPrimaryRing,
  multiPolygonToGeoJsonCoords,
  multiPolygonToGeoJsonGeometry,
  preferCentroid,
} from './geometry.ts';

import {
  pointInMultiPolygon,
  type CoverageMultiPolygon,
  type CoverageVertex,
} from './geometry.ts';

export type CoverageZone = {
  id: string;
  name: string;
  market_id?: string;
  kind?: string | null;
  polygon: CoverageVertex[];
  /** When set, PIP uses multi-part + holes; polygon kept for legacy display/H3 fallback. */
  multiPolygon?: CoverageMultiPolygon;
};

export type CoverageEvalResult = {
  inZone: boolean;
  reason?: string;
  matchedInclude?: { id: string; name: string; market_id?: string } | null;
  matchedExclude?: { id: string; name: string; market_id?: string } | null;
};

/** Ray-cast point-in-polygon. Ring may or may not repeat the first vertex. */
export function pointInPolygon(lat: number, lng: number, polygon: CoverageVertex[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function zoneContains(lat: number, lng: number, zone: CoverageZone): boolean {
  if (zone.multiPolygon && zone.multiPolygon.length > 0) {
    return pointInMultiPolygon(lat, lng, zone.multiPolygon);
  }
  const ring = Array.isArray(zone.polygon) ? zone.polygon : [];
  return ring.length >= 3 && pointInPolygon(lat, lng, ring);
}

function normalizeKind(kind: string | null | undefined): 'include' | 'exclude' {
  return kind === 'exclude' ? 'exclude' : 'include';
}

/**
 * inZone = inside ≥1 include AND not inside any exclude.
 */
export function evaluateCoverage(
  lat: number,
  lng: number,
  zones: CoverageZone[],
): CoverageEvalResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { inZone: false, reason: 'Invalid coordinates' };
  }

  let matchedInclude: CoverageEvalResult['matchedInclude'] = null;
  let matchedExclude: CoverageEvalResult['matchedExclude'] = null;

  for (const zone of zones) {
    if (!zoneContains(lat, lng, zone)) continue;

    const kind = normalizeKind(zone.kind);
    const hit = { id: zone.id, name: zone.name, market_id: zone.market_id };
    if (kind === 'exclude') {
      if (!matchedExclude) matchedExclude = hit;
    } else if (!matchedInclude) {
      matchedInclude = hit;
    }
  }

  if (matchedExclude) {
    return {
      inZone: false,
      reason: `Excluded by zone “${matchedExclude.name}”`,
      matchedInclude,
      matchedExclude,
    };
  }
  if (matchedInclude) {
    return {
      inZone: true,
      matchedInclude,
      matchedExclude: null,
    };
  }
  return {
    inZone: false,
    reason: 'Outside all active delivery zones',
    matchedInclude: null,
    matchedExclude: null,
  };
}

export type { ActiveCoverageZone, LatLng, ZoneKind } from './zonesPayload.ts';
export {
  DELIVERY_ZONES_CACHE_KEY,
  DELIVERY_ZONES_CACHE_TTL_MS,
  parseAllZonesPayload,
} from './zonesPayload.ts';
export { createZoneCache, type ZoneCacheStorage } from './zoneCache.ts';
export { createDeliveryZoneLoader } from './zoneLoader.ts';
export {
  buildParishSyntheticZone,
  isInsideParishFoundation,
  parseFoundationPolygon,
  parseFoundationGeometry,
  type ParishCoverageMode,
} from './parishCoverage.ts';
export {
  sanitizeVertices,
  sanitizeRing,
  sanitizeMultiPolygon,
  multiToLegacyRing,
} from './sanitizeVertices.ts';
export { createMemoryZoneCache } from './memoryZoneCache.ts';
export {
  normalizeDraftZonesFromAdmin,
  zonesToMapPolygons,
  draftZonesDifferFromPublished,
  type AdminDraftZoneInput,
  type ZonesToMapPolygonsFilter,
} from './adminZones.ts';
export {
  createAdminCoverageLayers,
  ADMIN_PUBLISHED_CACHE_KEY,
  type AdminCoverageLayers,
} from './adminCoverageLayers.ts';
export {
  COVERAGE_CUSTOMER_COPY,
  customerCopyForReason,
  evaluateHexCoverage,
  type CoverageReasonCode,
} from './hexCoverage.ts';
