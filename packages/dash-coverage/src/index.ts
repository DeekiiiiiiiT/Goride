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
  type CoverageMultiPolygon,
  type CoverageVertex,
} from './geometry.ts';

export type {
  CoverageReasonCode,
  EvaluableZone,
  ZoneKind,
  ZonePolicy,
  ZonePolicyAction,
  ZoneSchedule,
} from './zoneEval.ts';

export type CoverageZone = {
  id: string;
  name: string;
  market_id?: string;
  kind?: string | null;
  source?: string | null;
  polygon: CoverageVertex[];
  /** When set, PIP uses multi-part + holes; polygon kept for legacy display/H3 fallback. */
  multiPolygon?: CoverageMultiPolygon;
  priority?: number;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  category?: string | null;
  reason?: string | null;
  schedules?: import('./zoneEval.ts').ZoneSchedule[];
  zone_policy?: import('./zoneEval.ts').ZonePolicy | null;
};

export type CoverageEvalResult = {
  inZone: boolean;
  reason?: string;
  reasonCode?: import('./zoneEval.ts').CoverageReasonCode;
  policy?: import('./zoneEval.ts').ZonePolicy;
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

import {
  customerCopyForReason,
  filterActiveZones,
  normalizeKind,
  normalizePolicy,
  pickWinningMatch,
  reasonCodeForCategory,
  zoneContains,
  type ZoneMatch,
} from './zoneEval.ts';

export {
  filterActiveZones,
  normalizeKind,
  normalizePolicy,
  pickWinningMatch,
  zoneContains,
} from './zoneEval.ts';

/**
 * ADR-0014: collect matches, filter active/time/schedule, highest priority wins.
 * Default exclude (priority 10) beats include (priority 0); safe islands use higher include priority.
 */
export function evaluateCoverage(
  lat: number,
  lng: number,
  zones: CoverageZone[],
  at: Date = new Date(),
): CoverageEvalResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { inZone: false, reason: 'Invalid coordinates', reasonCode: 'out_of_coverage' };
  }

  const active = filterActiveZones(zones, at);
  const matches: ZoneMatch[] = [];

  for (const zone of active) {
    if (!zoneContains(lat, lng, zone)) continue;
    matches.push({
      zone,
      kind: normalizeKind(zone.kind),
      priority: Number.isFinite(Number(zone.priority)) ? Number(zone.priority) : 0,
    });
  }

  const winner = pickWinningMatch(matches);
  const matchedInclude = matches.find((m) => m.kind === 'include');
  const matchedExclude = matches.find((m) => m.kind === 'exclude');

  if (!winner) {
    return {
      inZone: false,
      reason: 'Outside all active delivery zones',
      reasonCode: 'out_of_coverage',
      matchedInclude: null,
      matchedExclude: null,
    };
  }

  const hit = {
    id: winner.zone.id,
    name: winner.zone.name,
    market_id: winner.zone.market_id,
  };

  if (winner.kind === 'exclude') {
    const policy = normalizePolicy(winner.zone.zone_policy);
    const reasonCode = reasonCodeForCategory(winner.zone.category);
    const blocked = policy.action === 'block';
    return {
      inZone: !blocked,
      reason: blocked
        ? customerCopyForReason(reasonCode, winner.zone.category)
        : undefined,
      reasonCode: blocked ? reasonCode : undefined,
      policy,
      matchedInclude: matchedInclude
        ? {
            id: matchedInclude.zone.id,
            name: matchedInclude.zone.name,
            market_id: matchedInclude.zone.market_id,
          }
        : null,
      matchedExclude: hit,
    };
  }

  return {
    inZone: true,
    matchedInclude: hit,
    matchedExclude: matchedExclude
      ? {
          id: matchedExclude.zone.id,
          name: matchedExclude.zone.name,
          market_id: matchedExclude.zone.market_id,
        }
      : null,
  };
}

import {
  filterLiveCoverageZones,
} from './liveCoverageZones.ts';

export {
  filterLiveCoverageZones,
  coverageRoleForZone,
  marketHasServiceAreas,
  isServiceIncludeSource,
  isImportIncludeSource,
} from './liveCoverageZones.ts';

/** ADR-0018: apply service-area live filter, then evaluateCoverage. */
export function evaluateLiveCoverage(
  lat: number,
  lng: number,
  zones: CoverageZone[],
  at: Date = new Date(),
): CoverageEvalResult {
  return evaluateCoverage(lat, lng, filterLiveCoverageZones(zones), at);
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
} from './hexCoverage.ts';
export type { CoverageReasonCode } from './zoneEval.ts';
