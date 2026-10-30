// Stitch: dominion-redesign/7b9231f8dae1411996e38bd680d73727
import { placesSend, type Taxonomy } from "../placesApi";
import type { RegisterRow } from "./registerFormat";

export type RegisterSummary = {
  total: number;
  verified: number;
  pending: number;
  pinsChecked: number;
  onPlug: number;
  needAttention: number;
};

export type RegisterList = {
  rows: RegisterRow[];
  total: number;
  page: number;
  summary?: RegisterSummary;
};

export type PlaceDetail = {
  place: Record<string, unknown> & {
    id: string;
    name: string;
    place_type: string;
    lat: number | null;
    lng: number | null;
    status: string;
    pin_state: string;
    address: string | null;
    parish: string | null;
    phone: string | null;
    website: string | null;
    plus_code: string | null;
    pcode: string | null;
    geofence_m: number | null;
    origin_app: string | null;
    verified_at: string | null;
    updated_at: string | null;
    brand_id: string | null;
    brand?: { name?: string } | { name?: string }[] | null;
    place_facility?: { id: string; facility_type: string; label: string | null }[];
    place_alias?: { id: string; kind: string; raw_value: string | null }[];
  };
  evidence: { id: string; note: string | null; created_at: string }[];
  history: { action: string; reason: string | null; actor: string | null; created_at: string }[];
  prices: { grade: string; price_per_litre: number; observed_at: string | null }[];
  public: boolean;
};

export type ImportCheck = {
  rows: Array<{
    row: number;
    name: string;
    placeType: string;
    parish: string | null;
    errors: string[];
    duplicates: unknown[];
  }>;
  errorCount: number;
  saved: number;
};

export function registerPath(filters: Record<string, string>) {
  const params = new URLSearchParams({ list: "places" });
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    params.set(key === "p" ? "page" : key, value);
  }
  return `/admin/register?${params.toString()}`;
}

export function loadRegister(apiBase: string, getToken: () => Promise<string | null>, filters: Record<string, string>) {
  return placesSend<RegisterList>(apiBase, getToken, registerPath(filters));
}

export function loadPlace(apiBase: string, getToken: () => Promise<string | null>, id: string) {
  return placesSend<PlaceDetail>(apiBase, getToken, `/admin/register/${id}`);
}

export function savePlace(apiBase: string, getToken: () => Promise<string | null>, id: string | null, body: Record<string, unknown>) {
  return placesSend<{ id: string; ok?: boolean; missing?: string[] }>(apiBase, getToken, id ? `/admin/register/${id}` : "/admin/register", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function bulkPlaces(apiBase: string, getToken: () => Promise<string | null>, body: Record<string, unknown>) {
  return placesSend(apiBase, getToken, "/admin/register/bulk", { method: "POST", body: JSON.stringify(body) });
}

export function checkImport(apiBase: string, getToken: () => Promise<string | null>, rows: unknown[], fileName: string, dryRun: boolean) {
  return placesSend<ImportCheck>(apiBase, getToken, "/admin/register/import", {
    method: "POST",
    body: JSON.stringify({ rows, fileName, dry_run: dryRun }),
  });
}

export function mergePlaces(apiBase: string, getToken: () => Promise<string | null>, id: string, keep: string, drop: string, reason: string) {
  return placesSend(apiBase, getToken, `/admin/register/${id}/merge`, {
    method: "POST",
    body: JSON.stringify({ keep, drop, reason }),
  });
}

export function verifyPlace(apiBase: string, getToken: () => Promise<string | null>, id: string) {
  return placesSend(apiBase, getToken, `/admin/register/${id}/verify`, { method: "POST" });
}

export async function exportPlaces(apiBase: string, getToken: () => Promise<string | null>, filters: Record<string, string>) {
  const token = await getToken();
  const params = new URLSearchParams({ list: "places" });
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== "p") params.set(key, value);
  }
  const response = await fetch(`${apiBase}/admin/register/export?${params.toString()}`, {
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
  if (!response.ok) throw new Error("Could not export places");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "places.csv";
  link.click();
}

export function loadTaxonomy(apiBase: string, getToken: () => Promise<string | null>) {
  return placesSend<Taxonomy>(apiBase, getToken, "/admin/taxonomy");
}

export function nearbyPlaces(apiBase: string, getToken: () => Promise<string | null>, lat: number, lng: number, type: string, except?: string) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), type });
  if (except) params.set("except", except);
  return placesSend<{ duplicates: Array<Record<string, unknown>> }>(apiBase, getToken, `/admin/register/nearby?${params.toString()}`);
}
