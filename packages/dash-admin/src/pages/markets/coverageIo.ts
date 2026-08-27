/** Parse / serialize town coverage outlines + full-fidelity COD-AB boundary import. */

export type IoVertex = { lat: number; lng: number };

export type IoRing = IoVertex[];
export type IoPolygonPart = { outer: IoRing; holes: IoRing[] };
export type IoMultiPolygon = IoPolygonPart[];

export type ExportZoneRow = {
  kind: string;
  name: string;
  id: string;
  source?: string | null;
  radius_m?: number | null;
  center_lat?: number | null;
  center_lng?: number | null;
  polygon: IoVertex[];
};

export const LEGACY_IMPORT_BLOCKED_MESSAGE =
  'Official multi-part / multi-feature GeoJSON is not supported on this import path. Use Import Boundaries.';

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function dropClosing(ring: IoVertex[]): IoVertex[] {
  if (ring.length < 2) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a.lat === b.lat && a.lng === b.lng) return ring.slice(0, -1);
  return ring;
}

function coordsToRing(coords: unknown): IoRing | null {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const points: IoVertex[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    points.push({ lat, lng });
  }
  const ring = dropClosing(points);
  return ring.length >= 3 ? ring : null;
}

function geometryToMulti(geometry: Record<string, unknown>): IoMultiPolygon | null {
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const rings: IoRing[] = [];
    for (const r of geometry.coordinates as unknown[]) {
      const ring = coordsToRing(r);
      if (ring) rings.push(ring);
    }
    if (rings.length === 0) return null;
    return [{ outer: rings[0], holes: rings.slice(1) }];
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const parts: IoMultiPolygon = [];
    for (const poly of geometry.coordinates as unknown[]) {
      if (!Array.isArray(poly)) continue;
      const rings: IoRing[] = [];
      for (const r of poly) {
        const ring = coordsToRing(r);
        if (ring) rings.push(ring);
      }
      if (rings.length > 0) parts.push({ outer: rings[0], holes: rings.slice(1) });
    }
    return parts.length > 0 ? parts : null;
  }
  return null;
}

/** Walk FeatureCollection / Feature / bare geometry — shared by pin + polygon parsers. */
export function forEachGeoJsonFeature(
  geojson: unknown,
  visit: (hit: {
    geometry: Record<string, unknown>;
    properties: Record<string, unknown>;
    featureIndex: number;
  }) => void,
): void {
  if (!geojson || typeof geojson !== 'object') return;
  const g = geojson as Record<string, unknown>;

  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    g.features.forEach((f, featureIndex) => {
      if (!f || typeof f !== 'object') return;
      const feat = f as Record<string, unknown>;
      if (!feat.geometry || typeof feat.geometry !== 'object') return;
      visit({
        geometry: feat.geometry as Record<string, unknown>,
        properties:
          feat.properties && typeof feat.properties === 'object'
            ? (feat.properties as Record<string, unknown>)
            : {},
        featureIndex,
      });
    });
    return;
  }

  if (g.type === 'Feature' && g.geometry && typeof g.geometry === 'object') {
    visit({
      geometry: g.geometry as Record<string, unknown>,
      properties:
        g.properties && typeof g.properties === 'object'
          ? (g.properties as Record<string, unknown>)
          : {},
      featureIndex: 0,
    });
    return;
  }

  if (
    g.type === 'Polygon' ||
    g.type === 'MultiPolygon' ||
    g.type === 'Point' ||
    g.type === 'MultiPoint'
  ) {
    visit({
      geometry: g,
      properties:
        g.properties && typeof g.properties === 'object'
          ? (g.properties as Record<string, unknown>)
          : {},
      featureIndex: 0,
    });
  }
}

/** Walk FeatureCollection / Feature / raw geometry → polygonal geometries. */
export function walkPolygonalGeometries(
  geojson: unknown,
): Array<{ geometry: Record<string, unknown>; properties: Record<string, unknown> }> {
  const out: Array<{ geometry: Record<string, unknown>; properties: Record<string, unknown> }> = [];
  forEachGeoJsonFeature(geojson, ({ geometry, properties }) => {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return;
    out.push({ geometry, properties });
  });
  return out;
}

export type GeoJsonComplexity = {
  featureCount: number;
  polygonalFeatureCount: number;
  multiPolygonParts: number;
  holeRingCount: number;
  isUnsafeForLegacyImport: boolean;
};

export function inspectGeoJsonComplexity(geojson: unknown): GeoJsonComplexity {
  const walked = walkPolygonalGeometries(geojson);
  let multiPolygonParts = 0;
  let holeRingCount = 0;
  for (const { geometry } of walked) {
    const multi = geometryToMulti(geometry);
    if (!multi) continue;
    multiPolygonParts += multi.length;
    for (const part of multi) holeRingCount += part.holes.length;
  }
  const polygonalFeatureCount = walked.length;
  const featureCount =
    geojson &&
    typeof geojson === 'object' &&
    (geojson as { type?: string }).type === 'FeatureCollection' &&
    Array.isArray((geojson as { features?: unknown[] }).features)
      ? (geojson as { features: unknown[] }).features.length
      : polygonalFeatureCount;
  const isUnsafeForLegacyImport =
    polygonalFeatureCount > 1 || multiPolygonParts > 1 || holeRingCount > 0;
  return {
    featureCount,
    polygonalFeatureCount,
    multiPolygonParts,
    holeRingCount,
    isUnsafeForLegacyImport,
  };
}

/**
 * Legacy single-ring import. Hard-blocks MultiPolygon (>1 part), multi-feature, and holes.
 * Returns null when blocked or invalid.
 */
export function polygonFromGeoJson(geojson: unknown): IoVertex[] | null {
  if (!geojson || typeof geojson !== 'object') return null;
  const complexity = inspectGeoJsonComplexity(geojson);
  if (complexity.isUnsafeForLegacyImport) return null;

  const walked = walkPolygonalGeometries(geojson);
  if (walked.length !== 1) return null;
  const multi = geometryToMulti(walked[0].geometry);
  if (!multi || multi.length !== 1 || multi[0].holes.length > 0) return null;
  return multi[0].outer;
}

export function isLegacyGeoJsonBlocked(geojson: unknown): boolean {
  return inspectGeoJsonComplexity(geojson).isUnsafeForLegacyImport;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\bsaint\b/g, 'st')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'unnamed'
  );
}

function detectAdminLevel(props: Record<string, unknown>): 0 | 1 | 2 | 3 | null {
  if (typeof props.adm3_pcode === 'string' && props.adm3_pcode) return 3;
  if (typeof props.adm2_pcode === 'string' && props.adm2_pcode) return 2;
  if (typeof props.adm1_pcode === 'string' && props.adm1_pcode) return 1;
  if (typeof props.adm0_pcode === 'string' && props.adm0_pcode) return 0;
  return null;
}

function nameForLevel(props: Record<string, unknown>, level: 0 | 1 | 2 | 3 | null): string {
  const keys =
    level === 3
      ? ['adm3_name', 'name']
      : level === 2
        ? ['adm2_name', 'name']
        : level === 1
          ? ['adm1_name', 'name']
          : level === 0
            ? ['adm0_name', 'name']
            : ['name', 'adm3_name', 'adm2_name', 'adm1_name', 'adm0_name'];
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return 'Unnamed';
}

function pcodeForLevel(props: Record<string, unknown>, level: 0 | 1 | 2 | 3 | null): string | null {
  if (level === 3 && typeof props.adm3_pcode === 'string') return props.adm3_pcode;
  if (level === 2 && typeof props.adm2_pcode === 'string') return props.adm2_pcode;
  if (level === 1 && typeof props.adm1_pcode === 'string') return props.adm1_pcode;
  if (level === 0 && typeof props.adm0_pcode === 'string') return props.adm0_pcode;
  return null;
}

function parentPcodeForLevel(
  props: Record<string, unknown>,
  level: 0 | 1 | 2 | 3 | null,
): string | null {
  if (level === 3 && typeof props.adm2_pcode === 'string') return props.adm2_pcode;
  if (level === 2 && typeof props.adm1_pcode === 'string') return props.adm1_pcode;
  if (level === 1 && typeof props.adm0_pcode === 'string') return props.adm0_pcode;
  return null;
}

export type ParsedBoundaryFeature = {
  name: string;
  slug: string;
  pcode: string | null;
  parentPcode: string | null;
  adminLevel: 0 | 1 | 2 | 3 | null;
  areaSqkm: number | null;
  centerLat: number | null;
  centerLng: number | null;
  properties: Record<string, unknown>;
  multiPolygon: IoMultiPolygon;
  partCount: number;
  holeCount: number;
  vertexCount: number;
};

export type GeoJsonParseReport = {
  features: ParsedBoundaryFeature[];
  warnings: string[];
  errors: string[];
};

/** Full-fidelity parse: all features, parts, and holes. Never silently truncates. */
export function parseBoundariesFromGeoJson(geojson: unknown): GeoJsonParseReport {
  const features: ParsedBoundaryFeature[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!geojson || typeof geojson !== 'object') {
    errors.push('Not a GeoJSON object');
    return { features, warnings, errors };
  }

  const walked = walkPolygonalGeometries(geojson);
  if (walked.length === 0) {
    errors.push('No Polygon / MultiPolygon features found');
    return { features, warnings, errors };
  }

  for (let i = 0; i < walked.length; i++) {
    const { geometry, properties } = walked[i];
    const multi = geometryToMulti(geometry);
    if (!multi) {
      errors.push(`Feature ${i + 1}: could not parse geometry`);
      continue;
    }
    const level = detectAdminLevel(properties);
    const name = nameForLevel(properties, level);
    const pcode = pcodeForLevel(properties, level);
    if (!pcode) {
      warnings.push(`Feature “${name}”: missing pcode — will not upsert until keyed`);
    }
    let holeCount = 0;
    let vertexCount = 0;
    for (const part of multi) {
      holeCount += part.holes.length;
      vertexCount += part.outer.length;
      for (const h of part.holes) vertexCount += h.length;
    }
    const areaRaw = properties.area_sqkm;
    const areaSqkm =
      typeof areaRaw === 'number'
        ? areaRaw
        : typeof areaRaw === 'string' && areaRaw
          ? Number(areaRaw)
          : null;
    const centerLat =
      typeof properties.center_lat === 'number'
        ? properties.center_lat
        : typeof properties.center_lat === 'string'
          ? Number(properties.center_lat)
          : null;
    const centerLng =
      typeof properties.center_lon === 'number'
        ? properties.center_lon
        : typeof properties.center_lng === 'number'
          ? properties.center_lng
          : typeof properties.center_lon === 'string'
            ? Number(properties.center_lon)
            : null;

    features.push({
      name,
      slug: slugify(name),
      pcode,
      parentPcode: parentPcodeForLevel(properties, level),
      adminLevel: level,
      areaSqkm: Number.isFinite(areaSqkm as number) ? (areaSqkm as number) : null,
      centerLat: Number.isFinite(centerLat as number) ? (centerLat as number) : null,
      centerLng: Number.isFinite(centerLng as number) ? (centerLng as number) : null,
      properties,
      multiPolygon: multi,
      partCount: multi.length,
      holeCount,
      vertexCount,
    });
  }

  return { features, warnings, errors };
}

export function multiPolygonToFlatRing(multi: IoMultiPolygon): IoVertex[] {
  return multi[0]?.outer ?? [];
}

export function multiPolygonToGeoJson(
  multi: IoMultiPolygon,
  properties: Record<string, unknown> = {},
): string {
  const coordinates = multi.map((part) => {
    const rings: number[][][] = [];
    const close = (ring: IoRing): number[][] => {
      const coords = ring.map((p) => [p.lng, p.lat] as [number, number]);
      if (coords.length > 0) {
        const f = coords[0];
        const l = coords[coords.length - 1];
        if (f[0] !== l[0] || f[1] !== l[1]) coords.push([...f]);
      }
      return coords;
    };
    rings.push(close(part.outer));
    for (const h of part.holes) rings.push(close(h));
    return rings;
  });
  return `${JSON.stringify(
    {
      type: 'Feature',
      properties,
      geometry: { type: 'MultiPolygon', coordinates },
    },
    null,
    2,
  )}\n`;
}

export type IoTownPin = { name: string; lat: number; lng: number; properties?: Record<string, unknown> };

function pinNameFromProps(props: Record<string, unknown> | undefined): string {
  if (!props) return 'Unnamed';
  for (const key of ['city', 'name', 'town', 'locality', 'label']) {
    const v = props[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return 'Unnamed';
}

function pointFromCoords(coords: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Pull Point features from FeatureCollection / Feature / [{lat,lng,name}]. */
export function pinsFromGeoJson(geojson: unknown): IoTownPin[] | null {
  if (!geojson) return null;

  if (Array.isArray(geojson)) {
    const pins: IoTownPin[] = [];
    for (const raw of geojson) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      pins.push({
        name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Unnamed',
        lat,
        lng,
        properties: row.properties && typeof row.properties === 'object'
          ? (row.properties as Record<string, unknown>)
          : undefined,
      });
    }
    return pins.length > 0 ? pins : null;
  }

  if (typeof geojson !== 'object') return null;
  const pins: IoTownPin[] = [];

  forEachGeoJsonFeature(geojson, ({ geometry, properties }) => {
    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
      const pt = pointFromCoords(geometry.coordinates);
      if (pt) {
        pins.push({
          name: pinNameFromProps(properties),
          lat: pt.lat,
          lng: pt.lng,
          properties: Object.keys(properties).length ? properties : undefined,
        });
      }
      return;
    }
    if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
      for (const c of geometry.coordinates as unknown[]) {
        const pt = pointFromCoords(c);
        if (pt) {
          pins.push({
            name: pinNameFromProps(properties),
            lat: pt.lat,
            lng: pt.lng,
            properties: Object.keys(properties).length ? properties : undefined,
          });
        }
      }
    }
  });

  return pins.length > 0 ? pins : null;
}

/** Parse lat/lng CSV: header optional. Accepts lat,lng or edge,ref,lat,lng per row. */
export function parsePolygonCsv(text: string): IoVertex[] | null {
  const raw = text.trim();
  if (!raw) return null;
  const points: IoVertex[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line.trim();
    if (!cleaned) continue;
    if (/^edge/i.test(cleaned) || /^lat\b/i.test(cleaned) || /^zone_/i.test(cleaned)) continue;
    const nums = cleaned.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) continue;
    const lat = Number(nums[nums.length - 2]);
    const lng = Number(nums[nums.length - 1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push({ lat, lng });
  }
  return points.length >= 3 ? points : null;
}

export function polygonToCsv(polygon: IoVertex[], includeHeader = true): string {
  const lines = includeHeader ? ['lat,lng'] : [];
  for (const p of polygon) {
    lines.push(`${p.lat},${p.lng}`);
  }
  return `${lines.join('\n')}\n`;
}

export function zonesToCsv(zones: ExportZoneRow[]): string {
  const header =
    'zone_kind,zone_name,zone_id,source,radius_m,center_lat,center_lng,point_index,lat,lng';
  const lines = [header];
  for (const z of zones) {
    z.polygon.forEach((p, idx) => {
      lines.push(
        [
          escapeCsv(z.kind),
          escapeCsv(z.name),
          escapeCsv(z.id),
          escapeCsv(z.source ?? ''),
          escapeCsv(z.radius_m ?? ''),
          escapeCsv(z.center_lat ?? ''),
          escapeCsv(z.center_lng ?? ''),
          idx,
          p.lat,
          p.lng,
        ].join(','),
      );
    });
  }
  return `${lines.join('\n')}\n`;
}

export function polygonToGeoJson(polygon: IoVertex[], name: string): string {
  const ring = polygon.map((p) => [p.lng, p.lat] as [number, number]);
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  }
  return `${JSON.stringify(
    {
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
    null,
    2,
  )}\n`;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  downloadBlob(filename, content, mime);
}

export function slugFilename(name: string, ext: string): string {
  const base = slugify(name);
  return `${base}.${ext}`;
}

export { slugify as slugifyBoundaryName };
