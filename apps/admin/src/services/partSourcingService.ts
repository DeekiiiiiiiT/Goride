import { API_ENDPOINTS } from "./apiConfig";
import { publicAnonKey } from "../utils/supabase/info";
import type {
  PartCategoryRecord,
  PartFitmentRecord,
  PartMasterRecord,
  SupplierPartOfferRecord,
  SupplierRecord,
  CompatiblePartsResponse,
} from "../types/partSourcing";

const base = () => `${API_ENDPOINTS.admin}/admin`;

function edgeHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const err = body.error ?? body.message;
  return typeof err === "string" && err.length ? err : `HTTP ${res.status}`;
}

export async function listPartCategories(accessToken: string): Promise<PartCategoryRecord[]> {
  const res = await fetch(`${base()}/part-categories`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as PartCategoryRecord[];
}

export async function createPartCategory(
  accessToken: string,
  payload: { slug: string; label: string; sort_order?: number; parent_id?: string | null },
): Promise<PartCategoryRecord> {
  const res = await fetch(`${base()}/part-categories`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as PartCategoryRecord;
}

export async function updatePartCategory(
  accessToken: string,
  id: string,
  payload: Partial<{ slug: string; label: string; sort_order: number; parent_id: string | null }>,
): Promise<PartCategoryRecord> {
  const res = await fetch(`${base()}/part-categories/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as PartCategoryRecord;
}

export async function deletePartCategory(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${base()}/part-categories/${id}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function listPartMasters(
  accessToken: string,
  categoryId?: string,
): Promise<PartMasterRecord[]> {
  const q = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : "";
  const res = await fetch(`${base()}/part-parts${q}`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as PartMasterRecord[];
}

export async function createPartMaster(
  accessToken: string,
  payload: {
    category_id: string;
    name: string;
    oem_part_number?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
    manufacturer?: string | null;
    part_kind?: string | null;
    maintenance_component_id?: string | null;
    interchange_group_id?: string | null;
  },
): Promise<PartMasterRecord> {
  const res = await fetch(`${base()}/part-parts`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as PartMasterRecord;
}

export async function updatePartMaster(
  accessToken: string,
  id: string,
  payload: Partial<{
    category_id: string;
    name: string;
    oem_part_number: string | null;
    description: string | null;
    metadata: Record<string, unknown>;
    manufacturer: string | null;
    part_kind: string | null;
    maintenance_component_id: string | null;
    interchange_group_id: string | null;
  }>,
): Promise<PartMasterRecord> {
  const res = await fetch(`${base()}/part-parts/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as PartMasterRecord;
}

export async function deletePartMaster(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${base()}/part-parts/${id}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function listSuppliers(accessToken: string): Promise<SupplierRecord[]> {
  const res = await fetch(`${base()}/part-suppliers`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as SupplierRecord[];
}

export async function createSupplier(
  accessToken: string,
  payload: {
    name: string;
    contact_email?: string | null;
    contact_phone?: string | null;
    default_lead_time_days?: number | null;
    notes?: string | null;
  },
): Promise<SupplierRecord> {
  const res = await fetch(`${base()}/part-suppliers`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as SupplierRecord;
}

export async function updateSupplier(
  accessToken: string,
  id: string,
  payload: Partial<{
    name: string;
    contact_email: string | null;
    contact_phone: string | null;
    default_lead_time_days: number | null;
    notes: string | null;
  }>,
): Promise<SupplierRecord> {
  const res = await fetch(`${base()}/part-suppliers/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as SupplierRecord;
}

export async function deleteSupplier(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${base()}/part-suppliers/${id}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function listPartOffers(
  accessToken: string,
  opts?: { part_id?: string; supplier_id?: string },
): Promise<SupplierPartOfferRecord[]> {
  const p = new URLSearchParams();
  if (opts?.part_id) p.set("part_id", opts.part_id);
  if (opts?.supplier_id) p.set("supplier_id", opts.supplier_id);
  const q = p.toString() ? `?${p.toString()}` : "";
  const res = await fetch(`${base()}/part-offers${q}`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as SupplierPartOfferRecord[];
}

export async function createPartOffer(
  accessToken: string,
  payload: {
    supplier_id: string;
    part_id: string;
    supplier_sku: string;
    unit_price?: number;
    currency?: string;
    moq?: number;
    lead_time_days?: number | null;
    url?: string | null;
    is_active?: boolean;
    source?: string;
    core_charge?: number | null;
    warranty_months?: number | null;
    warranty_km?: number | null;
    organization_id?: string | null;
    freight_estimate?: number | null;
    duty_rate?: number | null;
    fx_rate_to_jmd?: number | null;
    price_observed_at?: string | null;
  },
): Promise<SupplierPartOfferRecord> {
  const res = await fetch(`${base()}/part-offers`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as SupplierPartOfferRecord;
}

export async function updatePartOffer(
  accessToken: string,
  id: string,
  payload: Partial<{
    unit_price: number;
    currency: string;
    moq: number;
    lead_time_days: number | null;
    url: string | null;
    is_active: boolean;
    supplier_sku: string;
  }>,
): Promise<SupplierPartOfferRecord> {
  const res = await fetch(`${base()}/part-offers/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as SupplierPartOfferRecord;
}

export async function deletePartOffer(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${base()}/part-offers/${id}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function listPartFitment(
  accessToken: string,
  opts?: { vehicle_catalog_id?: string; part_id?: string },
): Promise<PartFitmentRecord[]> {
  const p = new URLSearchParams();
  if (opts?.vehicle_catalog_id) p.set("vehicle_catalog_id", opts.vehicle_catalog_id);
  if (opts?.part_id) p.set("part_id", opts.part_id);
  const q = p.toString() ? `?${p.toString()}` : "";
  const res = await fetch(`${base()}/part-fitment${q}`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as PartFitmentRecord[];
}

export async function createPartFitment(
  accessToken: string,
  payload: {
    part_id: string;
    vehicle_catalog_id: string;
    chassis_code?: string | null;
    engine_code?: string | null;
    year_from?: number | null;
    year_to?: number | null;
  },
): Promise<PartFitmentRecord> {
  const res = await fetch(`${base()}/part-fitment`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as PartFitmentRecord;
}

export async function updatePartFitment(
  accessToken: string,
  id: string,
  payload: Partial<{
    chassis_code: string | null;
    engine_code: string | null;
    year_from: number | null;
    year_to: number | null;
  }>,
): Promise<PartFitmentRecord> {
  const res = await fetch(`${base()}/part-fitment/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as PartFitmentRecord;
}

export async function deletePartFitment(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${base()}/part-fitment/${id}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function previewPartsForCatalog(
  accessToken: string,
  vehicleCatalogId: string,
  categoryId?: string,
): Promise<CompatiblePartsResponse> {
  const q = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : "";
  const res = await fetch(`${base()}/part-catalog/${vehicleCatalogId}/parts-preview${q}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as CompatiblePartsResponse;
}

export type PartsSourcingRequestRow = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  need_text: string;
  status: string;
  created_at: string;
  admin_note?: string | null;
};

export async function listPartsSourcingRequests(
  accessToken: string,
  status = "open",
): Promise<PartsSourcingRequestRow[]> {
  const res = await fetch(
    `${API_ENDPOINTS.admin}/admin/parts-sourcing-requests?status=${encodeURIComponent(status)}`,
    { headers: edgeHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as PartsSourcingRequestRow[];
}

export async function updatePartsSourcingRequest(
  accessToken: string,
  id: string,
  status: string,
  adminNote?: string,
  resolvedPartId?: string | null,
): Promise<PartsSourcingRequestRow> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/parts-sourcing-requests/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ status, adminNote, resolvedPartId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as PartsSourcingRequestRow;
}

async function adminGet(accessToken: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}/${path}`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

async function adminSend(accessToken: string, path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}/${path}`, {
    method,
    headers: edgeHeaders(accessToken, "application/json"),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return await res.json();
}

export const partsEnterpriseApi = {
  platforms: (token: string) => adminGet(token, "vehicle-platforms"),
  engines: (token: string) => adminGet(token, "engine-families"),
  coverage: (token: string) => adminGet(token, "parts-coverage"),
  groups: (token: string) => adminGet(token, "part-groups"),
  createGroup: (token: string, body: Record<string, unknown>) => adminSend(token, "part-groups", "POST", body),
  rules: (token: string) => adminGet(token, "part-rules"),
  createRule: (token: string, body: Record<string, unknown>) => adminSend(token, "part-rules", "POST", body),
  importRows: (token: string, rows: unknown[]) => adminSend(token, "part-import", "POST", { rows }),
  undoImport: (token: string, batchId: string) => adminSend(token, "part-import/undo", "POST", { batchId }),
  linkReviews: (token: string) => adminGet(token, "part-link-reviews"),
  resolveLink: (token: string, id: string, body: Record<string, unknown>) => adminSend(token, `part-link-reviews/${id}`, "PATCH", body),
  cores: (token: string) => adminGet(token, "part-cores"),
  updateCore: (token: string, id: string, status: string) => adminSend(token, `part-cores/${id}`, "PATCH", { status }),
  claims: (token: string) => adminGet(token, "part-warranty-claims"),
  alerts: (token: string) => adminGet(token, "part-repeat-alerts"),
  dismissAlert: (token: string, id: string) => adminSend(token, `part-repeat-alerts/${id}`, "PATCH", {}),
  refreshAlerts: (token: string) => adminSend(token, "part-repeat-alerts/refresh", "POST", {}),
  quotes: (token: string) => adminGet(token, "part-quotes"),
  feedback: (token: string) => adminGet(token, "part-fit-feedback"),
  stock: (token: string) => adminGet(token, "org-part-stock"),
  supplierSearch: (token: string, partNumber: string) => adminSend(token, "part-supplier-search", "POST", { partNumber }),
  supersede: (token: string, body: { oldPartId: string; newPartId: string }) => adminSend(token, "part-supersession", "POST", body),
  search: (token: string, q: string) => adminGet(token, `part-search?q=${encodeURIComponent(q)}`),
  replyQuote: (token: string, id: string, body: Record<string, unknown>) => adminSend(token, `part-quotes/${id}/reply`, "POST", body),
  updateClaim: (token: string, id: string, status: string) => adminSend(token, `part-warranty-claims/${id}`, "PATCH", { status }),
  ruleReviews: (token: string) => adminGet(token, "part-rule-reviews"),
  resolveRuleReview: (token: string, id: string, notes: string) => adminSend(token, `part-rule-reviews/${id}`, "PATCH", { notes }),
  proposals: (token: string) => adminGet(token, "part-rule-proposals"),
  decideProposal: (token: string, id: string, status: "approved" | "rejected") => adminSend(token, `part-rule-proposals/${id}/decision`, "POST", { status }),
  components: (token: string) => adminGet(token, "service-components"),
  catalogVariants: (token: string, q: string) => adminGet(token, `catalog-variants?q=${encodeURIComponent(q)}`),
  setFamily: (token: string, body: { family: string; chassisCodes: string[]; shareBodyParts: boolean }) => adminSend(token, "vehicle-platform-families", "POST", body),
  setTieredSearch: (token: string, organizationId: string, enabled: boolean) => adminSend(token, "parts-tiered-search", "POST", { organizationId, enabled }),
};
