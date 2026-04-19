import { API_ENDPOINTS } from "./apiConfig";
import { publicAnonKey } from "../utils/supabase/info";
import type { VehicleCatalogPendingRequest } from "../types/vehicleCatalogPending";
import type { VehicleCatalogRecord } from "../types/vehicleCatalog";

function edgeHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

export async function listVehicleCatalogMatches(
  accessToken: string,
  params: { make?: string; model?: string; year?: string },
): Promise<VehicleCatalogRecord[]> {
  const sp = new URLSearchParams();
  if (params.make) sp.set("make", params.make);
  if (params.model) sp.set("model", params.model);
  if (params.year) sp.set("year", params.year);
  const res = await fetch(
    `${API_ENDPOINTS.fleet}/vehicle-catalog-matches?${sp.toString()}`,
    { headers: edgeHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []) as VehicleCatalogRecord[];
}

export async function listPendingVehicleCatalogRequests(
  accessToken: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<{ items: VehicleCatalogPendingRequest[]; total: number }> {
  const sp = new URLSearchParams();
  if (opts?.status) sp.set("status", opts.status);
  if (opts?.limit != null) sp.set("limit", String(opts.limit));
  if (opts?.offset != null) sp.set("offset", String(opts.offset));
  const res = await fetch(
    `${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests?${sp.toString()}`,
    { headers: edgeHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { items: data.items || [], total: data.total ?? 0 };
}

export async function getPendingVehicleCatalogRequest(
  accessToken: string,
  id: string,
): Promise<{ item: VehicleCatalogPendingRequest; fleetVehicle: Record<string, unknown> | null }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests/${id}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function rejectPendingVehicleCatalogRequest(
  accessToken: string,
  id: string,
  reason?: string,
): Promise<void> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests/${id}/reject`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function approveExistingPendingVehicleCatalogRequest(
  accessToken: string,
  id: string,
  existingCatalogId: string,
): Promise<unknown> {
  const res = await fetch(
    `${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests/${id}/approve-existing`,
    {
      method: "POST",
      headers: edgeHeaders(accessToken, "application/json"),
      body: JSON.stringify({ existing_catalog_id: existingCatalogId }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function approvePendingVehicleCatalogRequest(
  accessToken: string,
  id: string,
  catalogPayload: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests/${id}/approve`, {
    method: "POST",
    headers: edgeHeaders(accessToken, "application/json"),
    body: JSON.stringify(catalogPayload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
