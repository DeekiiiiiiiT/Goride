import { API_ENDPOINTS } from "./apiConfig";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../types/vehicleCatalog";
import { publicAnonKey } from "../utils/supabase/info";

const url = () => `${API_ENDPOINTS.admin}/admin/vehicle-catalog`;

/** Must match edge `VEHICLE_CATALOG_PURGE_CONFIRM` in `index.tsx` (purge route). */
export const VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE = "DELETE ALL";

/** Typed phrase for force-undo of an import batch that has dependents. */
export const VEHICLE_CATALOG_UNDO_BATCH_CONFIRM_PHRASE = "UNDO BATCH";

export type CatalogDependencyCounts = {
  maintenanceTemplates: number;
  partFitments: number;
  fleetVehicles: number;
};

export type CatalogBulkRowInput = {
  rowIndex: number;
  id?: string;
  payload: VehicleCatalogCreatePayload;
};

export type CatalogBulkRowResult = {
  rowIndex: number;
  ok: boolean;
  id?: string;
  action?: "created" | "updated";
  error?: string;
  item?: VehicleCatalogRecord;
};

export type CatalogOrphanVehicle = {
  vehicleId: string;
  organizationId: string | null;
  label: string | null;
  vehicle_catalog_id: string;
  reason: "missing_catalog_row" | "invalid_catalog_id";
};

function apiErrorBodyToString(raw: unknown, fallback: string): string {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (typeof raw === "object" && raw !== null && "message" in raw) {
    const m = (raw as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return fallback;
  }
}

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
  return apiErrorBodyToString(err, `HTTP ${res.status}`);
}

/** Retry transient 5xx / 429 with exponential backoff. */
async function fetchWithRetry(
  input: string,
  options: RequestInit = {},
  retries = 3,
  backoff = 500,
): Promise<Response> {
  try {
    const response = await fetch(input, options);
    if ((response.status >= 500 || response.status === 429) && retries > 0) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(input, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(input, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

export async function listVehicleCatalog(
  accessToken: string,
): Promise<{ items: VehicleCatalogRecord[]; total: number }> {
  const res = await fetchWithRetry(url(), {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  const items = (data.items || []) as VehicleCatalogRecord[];
  const total = typeof data.total === "number" ? data.total : items.length;
  return { items, total };
}

/** Omit null/undefined so PostgREST does not validate columns absent on older DBs. */
function jsonBodyOmitNullish(payload: VehicleCatalogCreatePayload): string {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (v !== null && v !== undefined) o[k] = v;
  }
  return JSON.stringify(o);
}

export async function createVehicleCatalog(
  accessToken: string,
  payload: VehicleCatalogCreatePayload,
): Promise<VehicleCatalogRecord> {
  const res = await fetchWithRetry(url(), {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: jsonBodyOmitNullish(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as VehicleCatalogRecord;
}

export async function updateVehicleCatalog(
  accessToken: string,
  id: string,
  payload: Partial<VehicleCatalogCreatePayload> & { expected_updated_at?: string },
): Promise<VehicleCatalogRecord> {
  const res = await fetchWithRetry(`${url()}/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const err = new Error(await parseError(res));
    (err as Error & { code?: string }).code = "STALE_WRITE";
    throw err;
  }
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as VehicleCatalogRecord;
}

export async function getVehicleCatalogDependencies(
  accessToken: string,
  id: string,
): Promise<CatalogDependencyCounts> {
  const res = await fetchWithRetry(`${url()}/${id}/dependencies`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { dependencies?: CatalogDependencyCounts };
  return (
    data.dependencies ?? {
      maintenanceTemplates: 0,
      partFitments: 0,
      fleetVehicles: 0,
    }
  );
}

export async function deleteVehicleCatalog(
  accessToken: string,
  id: string,
  opts?: { force?: boolean },
): Promise<{ dependencies?: CatalogDependencyCounts }> {
  const q = opts?.force ? "?force=true" : "";
  const res = await fetchWithRetry(`${url()}/${id}${q}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      dependencies?: CatalogDependencyCounts;
      code?: string;
    };
    const err = new Error(body.error || "Catalog row has dependents") as Error & {
      code?: string;
      dependencies?: CatalogDependencyCounts;
    };
    err.code = body.code || "CATALOG_HAS_DEPENDENTS";
    err.dependencies = body.dependencies;
    throw err;
  }
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json().catch(() => ({}))) as { dependencies?: CatalogDependencyCounts };
}

export async function bulkUpsertVehicleCatalog(
  accessToken: string,
  importBatchId: string,
  rows: CatalogBulkRowInput[],
): Promise<{
  import_batch_id: string;
  results: CatalogBulkRowResult[];
  created: number;
  updated: number;
  failed: number;
}> {
  const res = await fetchWithRetry(`${url()}/bulk`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ import_batch_id: importBatchId, rows }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as {
    import_batch_id: string;
    results: CatalogBulkRowResult[];
    created: number;
    updated: number;
    failed: number;
  };
}

export async function undoVehicleCatalogImportBatch(
  accessToken: string,
  importBatchId: string,
  opts?: { force?: boolean },
): Promise<{ deleted: number; dependencies: CatalogDependencyCounts | null }> {
  const res = await fetchWithRetry(`${url()}/undo-batch`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ import_batch_id: importBatchId, force: opts?.force === true }),
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      dependencies?: CatalogDependencyCounts;
      code?: string;
    };
    const err = new Error(body.error || "Batch has dependents") as Error & {
      code?: string;
      dependencies?: CatalogDependencyCounts;
    };
    err.code = body.code || "CATALOG_HAS_DEPENDENTS";
    err.dependencies = body.dependencies;
    throw err;
  }
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { deleted: number; dependencies: CatalogDependencyCounts | null };
}

export async function listVehicleCatalogOrphans(
  accessToken: string,
): Promise<{ items: CatalogOrphanVehicle[]; total: number }> {
  const res = await fetchWithRetry(`${url()}/orphans`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return {
    items: (data.items || []) as CatalogOrphanVehicle[],
    total: typeof data.total === "number" ? data.total : (data.items || []).length,
  };
}

/** Removes every motor catalog row. Requires exact `confirm` phrase (see UI). */
export async function purgeAllVehicleCatalog(
  accessToken: string,
  confirm: string,
): Promise<{ deleted: number }> {
  const res = await fetchWithRetry(`${url()}/purge`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ confirm }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { deleted?: number };
  return { deleted: Number(data.deleted ?? 0) };
}
