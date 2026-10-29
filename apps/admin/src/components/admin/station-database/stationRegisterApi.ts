import { API_ENDPOINTS } from "../../../services/apiConfig";
import { supabase } from "../../../utils/supabase/client";

export type StationFilters = {
  q: string;
  status: string;
  pcode: string;
  brand: string;
  pin: string;
  source: string;
  issue: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
};

export type StationListRow = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  pin_state: string;
  geofence_m: number | null;
  plus_code: string | null;
  origin_app: string | null;
  updated_at: string | null;
  verified_at: string | null;
  brand_id: string | null;
  brand_name: string | null;
  pcode1: string | null;
  parish_name: string | null;
  parish_text: string | null;
  parish_text_mismatch: boolean;
  source: string | null;
  possible_duplicate_ids: string[] | null;
  company_style_name: boolean;
  price_e10_87: number | null;
  price_outdated: boolean;
  issue_count: number;
  possible_duplicate: boolean;
  no_brand: boolean;
  pin_unchecked: boolean;
  not_verified: boolean;
  fill_count: number;
  last_fill_at: string | null;
};

export type StationSummary = {
  total: number;
  verified: number;
  pending: number;
  priced: number;
  issues: {
    duplicate: number;
    no_brand: number;
    parish_mismatch: number;
    pin_unchecked: number;
    company_name: number;
    not_verified: number;
  };
};

export type StationListResponse = {
  rows: StationListRow[];
  total: number;
  page: number;
  summary: StationSummary;
  parishes: { pcode: string; name: string }[];
  brands: { id: string; name: string }[];
};

export type StationPrice = {
  grade: string;
  price_per_litre: number;
  confidence: string | null;
  report_count: number | null;
  last_report_at?: string | null;
  outdated?: boolean | null;
  observed_at?: string | null;
};

export type StationDetail = {
  place: {
    id: string;
    name: string;
    brand_id: string | null;
    address: string | null;
    parish: string | null;
    phone: string | null;
    website: string | null;
    status: string;
    lat: number;
    lng: number;
    plus_code: string | null;
    pcode: string | null;
    pin_state: string;
    geofence_m: number | null;
    attributes: Record<string, unknown> | null;
    verified_at: string | null;
    updated_at: string | null;
    brand?: { name?: string; slug?: string } | null;
    place_facility?: { id: string; facility_type: string; label: string | null }[];
    place_alias?: { id: string; kind: string; raw_value: string | null; lat: number | null; lng: number | null }[];
  };
  evidence: { id: string; note: string | null; origin_app: string | null; created_at: string }[];
  history: { action: string; reason: string | null; actor: string | null; created_at: string }[];
  prices: StationPrice[];
  wholesaleE10: number | null;
  public: boolean;
};

async function authHeader() {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  return { Authorization: token ? `Bearer ${token}` : "" };
}

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The station register did not answer.");
  return body;
}

export async function listStations(filters: StationFilters): Promise<StationListResponse> {
  const query = new URLSearchParams({ type: "gas_station", page: String(filters.page) });
  if (filters.q) query.set("q", filters.q);
  if (filters.status) query.set("status", filters.status);
  if (filters.pcode) query.set("pcode", filters.pcode);
  if (filters.brand) query.set("brand", filters.brand);
  if (filters.pin) query.set("pin", filters.pin);
  if (filters.source) query.set("source", filters.source);
  if (filters.issue) query.set("issue", filters.issue);
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.dir) query.set("dir", filters.dir);
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/register?${query}`, { headers: await authHeader() });
  return readJson(response) as Promise<StationListResponse>;
}

export async function getStation(id: string): Promise<StationDetail> {
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/register/${id}`, { headers: await authHeader() });
  return readJson(response) as Promise<StationDetail>;
}

export async function patchStation(id: string, changed: Record<string, unknown>, reason: string) {
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/register/${id}`, {
    method: "PATCH",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({ ...changed, reason }),
  });
  return readJson(response);
}

export async function createStation(body: Record<string, unknown>) {
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/register`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(response);
}

export async function nearbyStations(lat: number, lng: number, exceptId?: string) {
  const query = new URLSearchParams({ lat: String(lat), lng: String(lng), type: "gas_station" });
  if (exceptId) query.set("except", exceptId);
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/register/nearby?${query}`, { headers: await authHeader() });
  return readJson(response) as Promise<{ duplicates: { id: string; name?: string; distance_m?: number }[] }>;
}

export async function bulkStations(action: string, ids: string[], reason: string, extra?: Record<string, unknown>) {
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/register/bulk`, {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({ action, ids, reason, ...extra }),
  });
  return readJson(response);
}

export async function verifyStation(id: string) {
  const response = await fetch(`${API_ENDPOINTS.explorer}/admin/register/${id}/verify`, {
    method: "POST",
    headers: await authHeader(),
  });
  return readJson(response);
}
