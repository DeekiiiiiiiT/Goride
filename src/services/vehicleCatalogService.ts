import { API_ENDPOINTS } from "./apiConfig";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../types/vehicleCatalog";
import { publicAnonKey } from "../utils/supabase/info";

const url = () => `${API_ENDPOINTS.admin}/admin/vehicle-catalog`;

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

export async function listVehicleCatalog(accessToken: string): Promise<VehicleCatalogRecord[]> {
  const res = await fetch(url(), {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.items || []) as VehicleCatalogRecord[];
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
  const res = await fetch(url(), {
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
  payload: Partial<VehicleCatalogCreatePayload>,
): Promise<VehicleCatalogRecord> {
  const res = await fetch(`${url()}/${id}`, {
    method: "PATCH",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as VehicleCatalogRecord;
}

export async function deleteVehicleCatalog(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${url()}/${id}`, {
    method: "DELETE",
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
