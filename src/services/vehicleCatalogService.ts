import { API_ENDPOINTS } from "./apiConfig";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../types/vehicleCatalog";

const url = () => `${API_ENDPOINTS.admin}/admin/vehicle-catalog`;

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error || `HTTP ${res.status}`;
}

export async function listVehicleCatalog(accessToken: string): Promise<VehicleCatalogRecord[]> {
  const res = await fetch(url(), {
    headers: { Authorization: `Bearer ${accessToken}` },
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.item as VehicleCatalogRecord;
}

export async function deleteVehicleCatalog(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${url()}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
}
