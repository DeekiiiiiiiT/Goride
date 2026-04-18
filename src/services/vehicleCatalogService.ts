import { API_ENDPOINTS } from "./apiConfig";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../types/vehicleCatalog";
import { apiErrorBodyToString } from "../utils/apiErrorMessage";
import { publicAnonKey } from "../utils/supabase/info";

const url = () => `${API_ENDPOINTS.admin}/admin/vehicle-catalog`;

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

export async function createVehicleCatalog(
  accessToken: string,
  payload: VehicleCatalogCreatePayload,
): Promise<VehicleCatalogRecord> {
  const res = await fetch(url(), {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(payload),
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
