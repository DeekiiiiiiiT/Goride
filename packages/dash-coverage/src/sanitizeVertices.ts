import {
  dropClosingVertex,
  MAX_EDITABLE_VERTICES,
  type CoverageMultiPolygon,
  type CoveragePolygonPart,
  type CoverageRing,
  type CoverageVertex,
} from './geometry.ts';

export { MAX_EDITABLE_VERTICES };

function asVertex(pt: unknown): CoverageVertex | null {
  if (!pt || typeof pt !== 'object' || !('lat' in pt) || !('lng' in pt)) return null;
  const lat = Number((pt as { lat: unknown }).lat);
  const lng = Number((pt as { lng: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Drop invalid lat/lng vertices — shared by admin + customer zone normalizers. */
export function sanitizeVertices(raw: unknown): CoverageVertex[] {
  if (!Array.isArray(raw)) return [];
  const out: CoverageVertex[] = [];
  for (const pt of raw) {
    const v = asVertex(pt);
    if (v) out.push(v);
  }
  return out;
}

/**
 * Sanitize one ring: drop invalids + duplicate closing vertex.
 * Bare call defaults to MAX_EDITABLE_VERTICES (500). Pass `{ maxVertices: undefined }`
 * (or omit the property via sanitizeMultiPolygon) for uncapped official geometry.
 */
export function sanitizeRing(
  raw: unknown,
  opts?: { maxVertices?: number },
): CoverageRing {
  let ring = dropClosingVertex(sanitizeVertices(raw));
  const max = opts === undefined ? MAX_EDITABLE_VERTICES : opts.maxVertices;
  if (max != null && Number.isFinite(max) && max > 0 && ring.length > max) {
    ring = ring.slice(0, max);
  }
  return ring;
}

function sanitizePart(raw: unknown, maxVertices?: number): CoveragePolygonPart | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.outer)) {
    const outer = sanitizeRing(o.outer, { maxVertices });
    if (outer.length < 3) return null;
    const holes: CoverageRing[] = [];
    if (Array.isArray(o.holes)) {
      for (const h of o.holes) {
        const ring = sanitizeRing(h, { maxVertices });
        if (ring.length >= 3) holes.push(ring);
      }
    }
    return { outer, holes };
  }
  // Legacy flat ring as a part
  if (Array.isArray(raw)) {
    const outer = sanitizeRing(raw, { maxVertices });
    return outer.length >= 3 ? { outer, holes: [] } : null;
  }
  return null;
}

/**
 * Accepts:
 * - legacy `{lat,lng}[]`
 * - `{ parts: [{ outer, holes }] }`
 * - `{ type:'MultiPolygon', coordinates }` GeoJSON
 * - array of parts
 */
export function sanitizeMultiPolygon(
  raw: unknown,
  opts?: { maxVertices?: number },
): CoverageMultiPolygon {
  if (!raw) return [];
  const max = opts?.maxVertices;

  // Legacy flat ring
  if (Array.isArray(raw)) {
    // Could be vertices or parts
    if (raw.length > 0 && raw[0] && typeof raw[0] === 'object' && 'lat' in (raw[0] as object)) {
      const part = sanitizePart(raw, max);
      return part ? [part] : [];
    }
    const parts: CoverageMultiPolygon = [];
    for (const item of raw) {
      const part = sanitizePart(item, max);
      if (part) parts.push(part);
    }
    return parts;
  }

  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;

  if (Array.isArray(o.parts)) {
    const parts: CoverageMultiPolygon = [];
    for (const item of o.parts) {
      const part = sanitizePart(item, max);
      if (part) parts.push(part);
    }
    return parts;
  }

  if (o.type === 'MultiPolygon' && Array.isArray(o.coordinates)) {
    return geoJsonCoordsToMulti(o.coordinates as unknown[], max);
  }
  if (o.type === 'Polygon' && Array.isArray(o.coordinates)) {
    return geoJsonCoordsToMulti([o.coordinates], max);
  }
  if (o.type === 'Feature' && o.geometry) {
    return sanitizeMultiPolygon(o.geometry, opts);
  }

  return [];
}

function geoJsonCoordsToMulti(
  coordinates: unknown[],
  maxVertices?: number,
): CoverageMultiPolygon {
  const parts: CoverageMultiPolygon = [];
  for (const poly of coordinates) {
    if (!Array.isArray(poly) || poly.length === 0) continue;
    const rings: CoverageRing[] = [];
    for (const ringCoords of poly) {
      if (!Array.isArray(ringCoords)) continue;
      const verts: CoverageVertex[] = [];
      for (const c of ringCoords) {
        if (!Array.isArray(c) || c.length < 2) continue;
        const lng = Number(c[0]);
        const lat = Number(c[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) verts.push({ lat, lng });
      }
      const ring = sanitizeRing(verts, { maxVertices });
      if (ring.length >= 3) rings.push(ring);
    }
    if (rings.length === 0) continue;
    parts.push({ outer: rings[0], holes: rings.slice(1) });
  }
  return parts;
}

export function multiToLegacyRing(multi: CoverageMultiPolygon): CoverageVertex[] {
  return multi[0]?.outer ?? [];
}
