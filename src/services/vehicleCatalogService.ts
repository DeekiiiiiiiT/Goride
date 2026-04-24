import { API_ENDPOINTS } from "./apiConfig";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../types/vehicleCatalog";
import { publicAnonKey } from "../utils/supabase/info";

const url = () => `${API_ENDPOINTS.admin}/admin/vehicle-catalog`;

/** Must match edge `VEHICLE_CATALOG_PURGE_CONFIRM` in `index.tsx` (purge route). */
export const VEHICLE_CATALOG_PURGE_CONFIRM_PHRASE = "DELETE ALL";

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
  const bodyStr = jsonBodyOmitNullish(payload);
  const res = await fetch(url(), {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: bodyStr,
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  const item = data.item as VehicleCatalogRecord;
  // #region agent log
  if (
    String(payload.make).trim() === "Toyota" &&
    String(payload.model).trim() === "Roomy" &&
    String(payload.chassis_code ?? "").trim() === "M910A"
  ) {
    const sent = JSON.parse(bodyStr) as Record<string, unknown>;
    fetch("http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4a340e" },
      body: JSON.stringify({
        sessionId: "4a340e",
        location: "vehicleCatalogService.ts:createVehicleCatalog",
        message: "Roomy M910A create sent vs returned",
        data: {
          sentKeys: Object.keys(sent).sort(),
          sent: {
            trim_suffix_code: sent.trim_suffix_code,
            full_model_code: sent.full_model_code,
            production_start_month: sent.production_start_month,
            engine_code: sent.engine_code,
            engine_type: sent.engine_type,
          },
          returned: {
            trim_suffix_code: item.trim_suffix_code,
            full_model_code: item.full_model_code,
            catalog_trim: item.catalog_trim,
            emissions_prefix: item.emissions_prefix,
            fuel_category: item.fuel_category,
            production_start_month: item.production_start_month,
            production_end_month: item.production_end_month,
            engine_code: item.engine_code,
            engine_type: item.engine_type,
            trim_series: item.trim_series,
          },
        },
        timestamp: Date.now(),
        hypothesisId: "H_wire",
      }),
    }).catch(() => {});
  }
  // #endregion
  return item;
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

/** Removes every motor catalog row. Requires exact `confirm` phrase (see UI). */
export async function purgeAllVehicleCatalog(
  accessToken: string,
  confirm: string,
): Promise<{ deleted: number }> {
  const res = await fetch(`${url()}/purge`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ confirm }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { deleted?: number };
  return { deleted: Number(data.deleted ?? 0) };
}
