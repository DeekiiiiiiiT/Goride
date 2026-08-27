import {
  pointInMultiPolygon,
  type CoverageMultiPolygon,
  type CoverageVertex,
} from './geometry.ts';
import { sanitizeMultiPolygon, sanitizeVertices } from './sanitizeVertices.ts';

export type ParishCoverageMode = 'town_zones' | 'parish_boundary';

function isMultiPolygonShape(raw: unknown): raw is CoverageMultiPolygon {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const first = raw[0];
  return !!first && typeof first === 'object' && 'outer' in first;
}

/** Flat ring for back-compat. Prefer parseFoundationGeometry for multi-part data. */
export function parseFoundationPolygon(raw: unknown): CoverageVertex[] | null {
  if (isMultiPolygonShape(raw)) {
    const outer = raw[0]?.outer;
    return outer && outer.length >= 3 ? outer : null;
  }
  if (!Array.isArray(raw)) return null;
  const out = sanitizeVertices(raw);
  return out.length >= 3 ? out : null;
}

/** Parse foundation as MultiPolygon (legacy flat ring → single part). */
export function parseFoundationGeometry(raw: unknown): CoverageMultiPolygon | null {
  if (!raw) return null;
  const multi = sanitizeMultiPolygon(raw);
  return multi.length > 0 ? multi : null;
}

/** No foundation polygon means no outer gate. */
export function isInsideParishFoundation(
  lat: number,
  lng: number,
  polygon: CoverageVertex[] | CoverageMultiPolygon | null | undefined,
): boolean {
  if (!polygon) return true;
  if (Array.isArray(polygon)) {
    if (polygon.length === 0) return true;
    if (isMultiPolygonShape(polygon)) {
      return pointInMultiPolygon(lat, lng, polygon);
    }
    const ring = polygon as CoverageVertex[];
    if (ring.length < 3) return true;
    return pointInMultiPolygon(lat, lng, [{ outer: ring, holes: [] }]);
  }
  return true;
}

export type CoverageZoneLike = {
  id: string;
  name: string;
  market_id?: string;
  kind?: string | null;
  polygon: CoverageVertex[];
  multiPolygon?: CoverageMultiPolygon;
};

/**
 * Synthetic include zone for parish_boundary mode.
 * Pass a flat ring and/or multiPolygon; when only multi is passed as 4th arg, polygon = first outer.
 */
export function buildParishSyntheticZone(
  parishId: string,
  marketId: string,
  parishName: string,
  polygon: CoverageVertex[] | CoverageMultiPolygon,
  multiPolygon?: CoverageMultiPolygon | null,
): CoverageZoneLike {
  if (isMultiPolygonShape(polygon)) {
    return {
      id: `parish-${parishId}-market-${marketId}`,
      name: `${parishName} parish`,
      market_id: marketId,
      kind: 'include',
      polygon: polygon[0]?.outer ?? [],
      multiPolygon: polygon,
    };
  }
  const flat = polygon as CoverageVertex[];
  const multi =
    multiPolygon && multiPolygon.length > 0
      ? multiPolygon
      : undefined;
  return {
    id: `parish-${parishId}-market-${marketId}`,
    name: `${parishName} parish`,
    market_id: marketId,
    kind: 'include',
    polygon: flat,
    multiPolygon: multi,
  };
}
