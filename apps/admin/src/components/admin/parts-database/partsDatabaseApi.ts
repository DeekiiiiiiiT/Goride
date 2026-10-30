// Stitch: dominion-redesign/ef01fa01e52f4c06b14c3f26887a3b07
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";
import { supabase } from "../../../utils/supabase/client";

export type PartsOverview = {
  vehicles: number;
  partsOnFile: number;
  vehiclesWithParts: number;
  waiting: number;
};

export type CatalogVariantPick = {
  id: string;
  make: string;
  model: string;
  chassis_code: string | null;
  engine_code: string | null;
  production_start_year: number | null;
  production_end_year: number | null;
  drivetrain?: string | null;
};

export type PartSection = {
  tier: number;
  label: string;
  sisterNames?: string | null;
  items: Array<Record<string, unknown>>;
};

async function authHeaders(): Promise<HeadersInit> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  return {
    Authorization: token ? `Bearer ${token}` : "",
    apikey: publicAnonKey,
  };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    headers: await authHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load this page");
  return body as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not save");
  return body as T;
}

export function fetchPartsOverview() {
  return getJson<PartsOverview>("parts-overview");
}

export function fetchFindParts(query: { make?: string; model?: string; year?: string; variantId?: string }) {
  const params = new URLSearchParams();
  if (query.make) params.set("make", query.make);
  if (query.model) params.set("model", query.model);
  if (query.year) params.set("year", query.year);
  if (query.variantId) params.set("variantId", query.variantId);
  return getJson<{
    variants: CatalogVariantPick[];
    picked: CatalogVariantPick | null;
    sections: PartSection[];
    coverage?: { essentials: number; essentialsTotal: number; specs: number; specsTotal: number; otherParts: number } | null;
  }>(`find-parts?${params.toString()}`);
}

export function fetchBodyFamilies() {
  return getJson<{
    families: Array<Record<string, unknown>>;
    unassigned: Array<Record<string, unknown>>;
    engines: Array<Record<string, unknown>>;
  }>("body-families");
}

export function saveBodyFamily(payload: {
  label?: string;
  familyId?: string;
  platformIds: string[];
  evidenceUrl: string;
  reason?: string;
  action?: "add" | "remove";
  dryRun?: boolean;
  move?: boolean;
}) {
  return postJson<{ before?: number; after?: number; beforeCars?: Array<Record<string, string>>; afterCars?: Array<Record<string, string>> }>("body-families", payload);
}

export function fetchChecklist(variantId: string) {
  return getJson<Record<string, unknown>>(`variants/${variantId}/checklist`);
}

export function saveGuidedPart(payload: Record<string, unknown>) {
  return postJson("parts/guided", payload);
}

export function fetchPartGroup(groupId: string, variantId: string) {
  return getJson<{
    groupId?: string;
    componentOpCode?: string | null;
    categoryId?: string | null;
    position?: string | null;
    yearFrom?: number | null;
    yearTo?: number | null;
    evidenceUrl?: string | null;
    note?: string | null;
    productionStartYear?: number | null;
    productionEndYear?: number | null;
    brands?: Array<{ manufacturer?: string; partNumber?: string; name?: string; kind?: string }>;
    listedVariantIds?: string[];
  }>(`parts/group/${groupId}?variantId=${encodeURIComponent(variantId)}`);
}

export function previewPartReach(payload: {
  variantId: string;
  tickedVariantIds: string[];
  componentOpCode?: string;
  groupId?: string;
  yearFrom?: string;
  yearTo?: string;
}) {
  return postJson<{ sister?: string[]; engine?: string[] }>("parts/reach-preview", payload);
}

export function excludeListing(payload: { groupId: string; variantId: string; reason: string; evidenceUrl: string }) {
  return postJson("parts/exclude", payload);
}

export function removeGuidedPart(payload: { groupId: string; variantId: string }) {
  return postJson("parts/remove", payload);
}

export function saveApplicability(payload: Record<string, unknown>) {
  return postJson("applicability", payload);
}

export function saveSpec(payload: Record<string, unknown>) {
  return postJson("specs", payload);
}

export function fetchPartJobs() {
  return getJson<{ items: Array<{ section: string; op_code: string; label: string; position: string | null }> }>("part-jobs");
}

export function fetchPartCategories() {
  return getJson<{ items: Array<{ id: string; label: string; slug: string }> }>("part-categories");
}

export function fetchSameModel(variantId: string) {
  return getJson<{ items: CatalogVariantPick[] }>(`same-model?variantId=${encodeURIComponent(variantId)}`);
}

export function fetchVehicleOptions(query: { make?: string; model?: string }) {
  const params = new URLSearchParams();
  if (query.make) params.set("make", query.make);
  if (query.model) params.set("model", query.model);
  return getJson<{ makes: string[]; models: string[]; years: number[] }>(`vehicle-options?${params.toString()}`);
}

export function fetchUniversalParts() {
  return getJson<{ items: Array<Record<string, unknown>> }>("universal-parts");
}

export function saveUniversalPart(payload: Record<string, unknown>) {
  return postJson("universal-parts", payload);
}

export function deleteUniversalPart(id: string) {
  return postJson("universal-parts/delete", { id });
}

export function fetchAdvancedTables(offset = 0) {
  return getJson<{
    offset: number;
    page: number;
    parts: { count: number; rows: Array<Record<string, unknown>> };
    brands: { count: number; rows: Array<Record<string, unknown>> };
    listings: { count: number; rows: Array<Record<string, unknown>> };
  }>(`advanced-tables?offset=${offset}`);
}

export function fetchImportBatches() {
  return getJson<{ items: Array<{ import_batch_id: string; row_count: number; imported_at: string }> }>("import-batches");
}

export function fetchSpecKeys() {
  return getJson<{ items: Array<{ key: string; label: string; unit: string | null }> }>("spec-keys");
}
