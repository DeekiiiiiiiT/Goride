import type { CoverageMultiPolygon } from './geometry.ts';

export type LatLng = { lat: number; lng: number };

export type ZoneKind = 'include' | 'exclude';

export type ZoneSchedule = {
  dow: number[];
  start_time: string;
  end_time: string;
  timezone?: string;
};

export type ZonePolicy = {
  action: 'block' | 'surcharge' | 'courier_opt_in' | 'manager_approval' | 'cash_disabled';
  params?: Record<string, unknown>;
};

export type ActiveCoverageZone = {
  id?: string;
  name?: string;
  kind: ZoneKind;
  polygon: LatLng[];
  multiPolygon?: CoverageMultiPolygon;
  market_id?: string;
  source?: string;
  priority?: number;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  category?: string | null;
  reason?: string | null;
  schedules?: ZoneSchedule[];
  zone_policy?: ZonePolicy | null;
};

/** Bump when zone payload shape / fallback policy changes so stale caches drop. */
export const DELIVERY_ZONES_CACHE_KEY = 'roam-dash-delivery-zones-v7';

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

function parseMultiPolygon(raw: unknown): CoverageMultiPolygon | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const first = raw[0];
  if (!first || typeof first !== 'object' || !('outer' in first)) return undefined;
  return raw as CoverageMultiPolygon;
}

function parseSchedules(raw: unknown): ZoneSchedule[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ZoneSchedule[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const s = row as Record<string, unknown>;
    const dow = Array.isArray(s.dow) ? s.dow.map((d) => Number(d)).filter(Number.isFinite) : [];
    if (!dow.length || typeof s.start_time !== 'string' || typeof s.end_time !== 'string') continue;
    out.push({
      dow,
      start_time: s.start_time,
      end_time: s.end_time,
      timezone: s.timezone != null ? String(s.timezone) : undefined,
    });
  }
  return out.length ? out : undefined;
}

function parsePolicy(raw: unknown): ZonePolicy | null | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const action = String(p.action ?? 'block');
  return { action: action as ZonePolicy['action'], params: p.params as Record<string, unknown> | undefined };
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
    const multi = parseMultiPolygon(z.multiPolygon);
    const ring = parseZoneRing(z.polygon ?? z.geometry ?? z.coordinates);
    if (!multi && ring.length < 3) continue;
    const kind: ZoneKind = z.kind === 'exclude' ? 'exclude' : 'include';
    out.push({
      id: z.id != null ? String(z.id) : undefined,
      name: z.name != null ? String(z.name) : undefined,
      kind,
      polygon: ring,
      multiPolygon: multi,
      market_id: z.market_id != null ? String(z.market_id) : undefined,
      source: z.source != null ? String(z.source) : undefined,
      priority: z.priority != null ? Number(z.priority) : undefined,
      is_active: z.is_active !== false,
      effective_from: z.effective_from != null ? String(z.effective_from) : null,
      effective_to: z.effective_to != null ? String(z.effective_to) : null,
      category: z.category != null ? String(z.category) : null,
      reason: z.reason != null ? String(z.reason) : null,
      schedules: parseSchedules(z.schedules),
      zone_policy: parsePolicy(z.zone_policy),
    });
  }
  return out;
}
