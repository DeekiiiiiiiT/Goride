import { API_ENDPOINTS } from '../../../../services/apiConfig';
import { shapeUrl, type ShapeRequest } from './jamaicaMapFormat';

export type ParishRow = {
  pcode: string;
  name: string;
  towns: number;
  communities: number;
};

export type RecentRow = {
  pcode: string;
  name: string;
  admin_level: number;
  version: number | null;
  source: string | null;
  created_at: string;
  actor_id: string | null;
};

export type MapSummary = {
  parishes: number;
  towns: number;
  communities: number;
  drafts: number;
  quality_issues: number;
  pins: number;
  last_publish_at: string | null;
  parishes_list: ParishRow[];
  recent: RecentRow[];
};

export type SearchHit = {
  pcode: string;
  name: string;
  admin_level: number;
  parent_name: string | null;
  center_lat: number | null;
  center_lng: number | null;
};

export type AreaChild = { pcode: string; name: string; admin_level: number };

export type AreaDetail = {
  place: {
    pcode: string;
    name: string;
    admin_level: number;
    parent_pcode: string | null;
    center_lat: number | null;
    center_lng: number | null;
  };
  metrics: {
    area_sqkm: number | null;
    vertex_count: number | null;
    version: number | null;
    source: string | null;
    created_at: string | null;
  } | null;
  path: Array<{ pcode: string; name: string; admin_level: number }>;
  children: AreaChild[];
  older_versions: number;
  used_by: { places: number; rush_markets: number; pins: number };
};

export type MapShape = {
  pcode: string;
  admin_level: number;
  parent_pcode: string | null;
  name: string;
  slug: string;
  center_lat: number | null;
  center_lng: number | null;
  rings?: Array<{ kind?: string; polygon?: Array<{ lat: number; lng: number }> }>;
};

async function geoFetch(token: string, path: string) {
  const res = await fetch(`${API_ENDPOINTS.catalog}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.message || body.error || 'Could not load the map.');
  return body;
}

export function fetchSummary(token: string): Promise<MapSummary> {
  return geoFetch(token, '/geo/summary');
}

export function fetchSearch(token: string, q: string): Promise<SearchHit[]> {
  return geoFetch(token, `/geo/search?q=${encodeURIComponent(q)}`).then((body) => body.results ?? []);
}

export function fetchArea(token: string, pcode: string): Promise<AreaDetail> {
  return geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}`);
}

export function fetchShapes(token: string, request: ShapeRequest): Promise<MapShape[]> {
  return geoFetch(token, shapeUrl(request)).then((body) => body.shapes ?? []);
}

export function fetchPins(token: string): Promise<Array<{ name: string; lat: number; lng: number; pcode: string | null }>> {
  return geoFetch(token, '/geo/places').then((body) => body.places ?? []);
}
