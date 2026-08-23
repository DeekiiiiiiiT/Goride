export type LatLng = { lat: number; lng: number };

export type ZoneKind = 'include' | 'exclude';

export type ActiveCoverageZone = {
  id?: string;
  name?: string;
  kind: ZoneKind;
  polygon: LatLng[];
  market_id?: string;
  source?: string;
};

/** Bump when zone payload shape / fallback policy changes so stale caches drop. */
export const DELIVERY_ZONES_CACHE_KEY = 'roam-dash-delivery-zones-v6';

export const DELIVERY_ZONES_CACHE_TTL_MS = 10 * 60 * 1000;

export function ringToLatLng(ring: unknown): LatLng[] {
  if (!Array.isArray(ring)) return [];
  const out: LatLng[] = [];
  for (const pt of ring) {
    if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
      out.push({ lng: Number(pt[0]), lat: Number(pt[1]) });
    } else if (pt && typeof pt === 'object' && 'lat' in pt && 'lng' in pt) {
      const p = pt as LatLng;
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) out.push({ lat: p.lat, lng: p.lng });
    }
  }
  return out;
}

export function parseZoneRing(polygon: unknown): LatLng[] {
  const geo = polygon as { type?: string; coordinates?: unknown[] } | undefined;
  if (geo?.type === 'Polygon' && Array.isArray(geo.coordinates)) {
    return ringToLatLng(geo.coordinates[0]);
  }
  return ringToLatLng(Array.isArray(polygon) ? (polygon as unknown[]) : []);
}

/** Extract include/exclude zones from API payload. */
export function parseAllZonesPayload(payload: unknown): ActiveCoverageZone[] {
  const zones =
    (payload as { zones?: unknown[] })?.zones ??
    (payload as { markets?: unknown[] })?.markets ??
    (Array.isArray(payload) ? (payload as unknown[]) : null);
  if (!Array.isArray(zones)) return [];

  const out: ActiveCoverageZone[] = [];
  for (const zone of zones) {
    if (!zone || typeof zone !== 'object') continue;
    const z = zone as Record<string, unknown>;
    if (z.is_active === false || z.active === false) continue;
    const ring = parseZoneRing(z.polygon ?? z.geometry ?? z.coordinates);
    if (ring.length < 3) continue;
    const kind: ZoneKind = z.kind === 'exclude' ? 'exclude' : 'include';
    out.push({
      id: z.id != null ? String(z.id) : undefined,
      name: z.name != null ? String(z.name) : undefined,
      kind,
      polygon: ring,
      market_id: z.market_id != null ? String(z.market_id) : undefined,
      source: z.source != null ? String(z.source) : undefined,
    });
  }
  return out;
}
