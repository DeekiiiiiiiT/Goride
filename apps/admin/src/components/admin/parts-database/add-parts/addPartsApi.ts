import { API_ENDPOINTS } from "../../../../services/apiConfig";
import { publicAnonKey } from "../../../../utils/supabase/info";
import { supabase } from "../../../../utils/supabase/client";
import type { AddPartsDraft, FitMode, PartTypeRow } from "./addPartsTypes";

async function authHeaders(): Promise<HeadersInit> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  return {
    Authorization: token ? `Bearer ${token}` : "",
    apikey: publicAnonKey,
    "Content-Type": "application/json",
  };
}

async function catalogGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, { headers: await authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Request failed");
  return json as T;
}

async function catalogPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Request failed");
  return json as T;
}

async function catalogPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/catalog/${path}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Request failed");
  return json as T;
}

export async function fetchSelfServePartTypes(): Promise<PartTypeRow[]> {
  const data = await catalogGet<{ types: PartTypeRow[] }>("part-types");
  return data.types ?? [];
}

export async function fetchEngineFamilies(q: string) {
  const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const data = await catalogGet<{ items: Array<{ id: string; code: string; notes?: string | null; variantCount?: number }> }>(`engine-families${params}`);
  return data.items ?? [];
}

export async function fetchEngineFamilyDetail(engineFamilyId: string) {
  return catalogGet<{
    id: string;
    code: string;
    notes?: string | null;
    variantCount?: number;
    makeCounts?: Array<{ make: string; count: number }>;
    vehicles?: Array<{
      id: string;
      make: string;
      model: string;
      chassisCode?: string | null;
      year?: number | null;
      engineCode?: string | null;
      fuelType?: string | null;
      displacementCc?: number | null;
    }>;
  }>(`engine-families/${engineFamilyId}`);
}

export type AddPartVehicleRow = {
  id: string;
  make: string;
  model: string;
  chassis_code?: string | null;
  engine_code?: string | null;
  production_start_year?: number | null;
  production_end_year?: number | null;
  version_name?: string | null;
  platform_id?: string | null;
  drivetrain?: string | null;
};

export async function searchAddPartVehicles(query: {
  q?: string;
  make?: string;
  model?: string;
  chassis?: string;
  engine?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
}) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.make?.trim()) params.set("make", query.make.trim());
  if (query.model?.trim()) params.set("model", query.model.trim());
  if (query.chassis?.trim()) params.set("chassis", query.chassis.trim());
  if (query.engine?.trim()) params.set("engine", query.engine.trim());
  if (query.year) params.set("year", String(query.year));
  if (query.yearFrom) params.set("yearFrom", String(query.yearFrom));
  if (query.yearTo) params.set("yearTo", String(query.yearTo));
  const data = await catalogGet<{ items: AddPartVehicleRow[] }>(`add-part/vehicles?${params}`);
  return data.items ?? [];
}

export async function fetchTopBrandsForPartType(partTypeId: string) {
  const data = await catalogGet<{ brands: Array<{ brand: string; count: number }> }>(`part-types/${partTypeId}/top-brands?limit=4`);
  return data.brands ?? [];
}

export async function fetchMyPartTypeRequests(status = "pending") {
  return catalogGet<{ items: Array<Record<string, unknown>> }>(`part-type-requests?mine=1&status=${encodeURIComponent(status)}`);
}

export async function decidePartTypeRequest(id: string, body: Record<string, unknown>) {
  return catalogPost<Record<string, unknown>>(`part-type-requests/${id}/decide`, body);
}

export async function upsertPartType(body: Record<string, unknown>, id?: string) {
  if (id) return catalogPatch<{ id: string }>(`part-types/${id}`, body);
  return catalogPost<{ id: string }>("part-types", body);
}

export async function lookupSelfServePart(brand: string, number: string) {
  const q = new URLSearchParams({ brand, number });
  return catalogGet<Record<string, unknown>>(`parts/lookup?${q}`);
}

export type SelfServePreview = {
  carCount: number;
  oeExtraCarCount: number;
  totalReach: number;
  excludedCount?: number;
  sentence?: string;
  trustLabel?: string;
  fitSummaryLines?: string[];
  fitSummaryStructured?: {
    positionLabel?: string;
    modelYearsLabel?: string;
    vehicleSummary?: string;
  };
};

export async function previewSelfServePart(input: {
  fitMode: FitMode;
  brand?: string;
  partNumber?: string;
  partTypeName?: string;
  tradeTerm?: string;
  sourceType?: string;
  position?: string;
  positionScheme?: string;
  engineCode?: string;
  engineFamilyId?: string;
  specKey?: string;
  specValue?: string;
  vehicleIds?: string[];
  listings?: AddPartsDraft["listings"];
  excludedVehicleIds?: string[];
  factoryNumbers?: Array<{ brand: string; number: string }>;
}) {
  const q = new URLSearchParams({ fitMode: input.fitMode });
  if (input.brand) q.set("brand", input.brand);
  if (input.partNumber) q.set("partNumber", input.partNumber);
  if (input.partTypeName) q.set("partTypeName", input.partTypeName);
  if (input.tradeTerm) q.set("tradeTerm", input.tradeTerm);
  if (input.sourceType) q.set("sourceType", input.sourceType);
  if (input.position) q.set("position", input.position);
  if (input.positionScheme) q.set("positionScheme", input.positionScheme);
  if (input.engineCode) q.set("engineCode", input.engineCode);
  if (input.engineFamilyId) q.set("engineFamilyId", input.engineFamilyId);
  if (input.specKey) q.set("specKey", input.specKey);
  if (input.specValue) q.set("specValue", input.specValue);
  if (input.vehicleIds?.length) q.set("vehicleIds", input.vehicleIds.join(","));
  if (input.listings?.length) q.set("listings", JSON.stringify(input.listings));
  if (input.excludedVehicleIds?.length) q.set("excludedVehicleIds", JSON.stringify(input.excludedVehicleIds));
  if (input.factoryNumbers?.length) q.set("factoryNumbers", JSON.stringify(input.factoryNumbers));
  return catalogGet<SelfServePreview>(`parts/add/preview?${q}`);
}

export async function saveSelfServePart(draft: AddPartsDraft) {
  const body: Record<string, unknown> = {
    partTypeId: draft.partType?.id,
    brand: draft.brand,
    partNumber: draft.partNumber,
    name: draft.name || draft.partNumber,
    sourceType: draft.sourceType,
    evidenceUrl: draft.evidenceUrl,
    fitMode: draft.fitMode,
    existingPartId: draft.existingPartId,
  };
  if (draft.fitMode === "specific") {
    body.listings = draft.listings.map((l) => ({
      vehicleId: l.vehicleId,
      position: l.position || draft.position,
      side: l.side || draft.side,
      yearFrom: l.yearFrom,
      yearTo: l.yearTo,
    }));
  }
  if (draft.fitMode === "engine") {
    body.engineFamilyId = draft.engineFamilyId;
    if (draft.excludedVehicleIds.length) body.excludedVehicleIds = draft.excludedVehicleIds;
  }
  if (draft.fitMode === "spec") {
    body.specKey = draft.specKey || draft.partType?.specFields?.[0]?.specKey;
    body.specValue = draft.specValue || Object.values(draft.specValues)[0];
  }
  if (draft.factoryNumbers.length) body.factoryNumbers = draft.factoryNumbers;
  return catalogPost<Record<string, unknown>>("parts/add", body);
}

export async function fetchRecentSelfServeParts() {
  return catalogGet<{ items: Array<Record<string, unknown>> }>("parts/recent?limit=20");
}

export async function undoSelfServePart(batchId: string) {
  return catalogPost<{ ok?: boolean }>("parts/undo", { batchId });
}

export async function submitPartTypeRequest(payload: {
  name: string;
  area?: string;
  exampleNumber?: string;
  reason: string;
}) {
  return catalogPost<{ request: Record<string, unknown> }>("part-type-requests", {
    name: payload.name,
    area: payload.area,
    exampleNumber: payload.exampleNumber,
    reason: payload.reason,
  });
}

export async function fetchPartTypeRequests(status = "pending") {
  return catalogGet<{ items: Array<Record<string, unknown>> }>(`part-type-requests?status=${encodeURIComponent(status)}`);
}
