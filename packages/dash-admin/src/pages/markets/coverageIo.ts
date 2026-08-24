/** Parse / serialize town coverage outlines for Import · Export. */

export type IoVertex = { lat: number; lng: number };

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

/** Pull outer ring from FeatureCollection / Feature / Polygon / MultiPolygon (geojson.io). */
export function polygonFromGeoJson(geojson: unknown): IoVertex[] | null {
  if (!geojson || typeof geojson !== 'object') return null;
  const g = geojson as Record<string, unknown>;

  let geometry: Record<string, unknown> | null = null;
  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    for (const f of g.features) {
      if (!f || typeof f !== 'object') continue;
      const feat = f as Record<string, unknown>;
      const geom =
        feat.geometry && typeof feat.geometry === 'object'
          ? (feat.geometry as Record<string, unknown>)
          : null;
      if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
        geometry = geom;
        break;
      }
    }
  } else if (g.type === 'Feature' && g.geometry && typeof g.geometry === 'object') {
    geometry = g.geometry as Record<string, unknown>;
  } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    geometry = g;
  }

  if (!geometry) return null;

  let ring: unknown = null;
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    ring = (geometry.coordinates as unknown[])[0];
  } else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const firstPoly = (geometry.coordinates as unknown[])[0];
    ring = Array.isArray(firstPoly) ? firstPoly[0] : null;
  }
  if (!Array.isArray(ring) || ring.length < 3) return null;

  const points: IoVertex[] = [];
  for (const c of ring) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    points.push({ lat, lng });
  }
  if (points.length >= 4) {
    const a = points[0];
    const b = points[points.length - 1];
    if (a.lat === b.lat && a.lng === b.lng) points.pop();
  }
  return points.length >= 3 ? points : null;
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
  const g = geojson as Record<string, unknown>;
  const pins: IoTownPin[] = [];

  const pushPoint = (geometry: Record<string, unknown>, props?: Record<string, unknown>) => {
    if (geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) return;
    const pt = pointFromCoords(geometry.coordinates);
    if (!pt) return;
    pins.push({ name: pinNameFromProps(props), lat: pt.lat, lng: pt.lng, properties: props });
  };

  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    for (const f of g.features) {
      if (!f || typeof f !== 'object') continue;
      const feat = f as Record<string, unknown>;
      const geom = feat.geometry && typeof feat.geometry === 'object'
        ? (feat.geometry as Record<string, unknown>)
        : null;
      const props = feat.properties && typeof feat.properties === 'object'
        ? (feat.properties as Record<string, unknown>)
        : undefined;
      if (geom) pushPoint(geom, props);
    }
  } else if (g.type === 'Feature' && g.geometry && typeof g.geometry === 'object') {
    pushPoint(
      g.geometry as Record<string, unknown>,
      g.properties && typeof g.properties === 'object'
        ? (g.properties as Record<string, unknown>)
        : undefined,
    );
  } else if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    const pt = pointFromCoords(g.coordinates);
    if (pt) {
      pins.push({
        name: pinNameFromProps(
          g.properties && typeof g.properties === 'object'
            ? (g.properties as Record<string, unknown>)
            : undefined,
        ),
        lat: pt.lat,
        lng: pt.lng,
      });
    }
  }

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
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'town';
  return `${base}.${ext}`;
}
