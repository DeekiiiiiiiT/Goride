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

export type VehicleCatalogMatchParams = {
  make?: string;
  model?: string;
  year?: string;
  /** 1–12; narrows catalog rows by production month when model year is ambiguous */
  month?: string;
  trim_series?: string;
  /** OEM chassis / frame index (e.g. M900A) */
  chassis_code?: string;
  body_type?: string;
  // Hybrid catalog matching disambiguators (server-side ilike filters):
  drivetrain?: string;
  transmission?: string;
  fuel_type?: string;
  fuel_grade?: string;
  engine_code?: string;
  engine_type?: string;
  catalog_trim?: string;
  full_model_code?: string;
};

export type VehicleCatalogMatchResponse = {
  items: VehicleCatalogRecord[];
  /** items.length capped at the SELECT limit; used to decide auto-match vs. force-pick. */
  exactCount: number;
  /** True when the result was capped by the SELECT limit (40 rows today). */
  truncated: boolean;
};

function buildVehicleCatalogMatchSearchParams(params: VehicleCatalogMatchParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (params.make) sp.set("make", params.make);
  if (params.model) sp.set("model", params.model);
  if (params.year) sp.set("year", params.year);
  if (params.month) sp.set("month", params.month);
  if (params.trim_series) sp.set("trim_series", params.trim_series);
  if (params.chassis_code) sp.set("chassis_code", params.chassis_code);
  if (params.body_type) sp.set("body_type", params.body_type);
  if (params.drivetrain) sp.set("drivetrain", params.drivetrain);
  if (params.transmission) sp.set("transmission", params.transmission);
  if (params.fuel_type) sp.set("fuel_type", params.fuel_type);
  if (params.fuel_grade) sp.set("fuel_grade", params.fuel_grade);
  if (params.engine_code) sp.set("engine_code", params.engine_code);
  if (params.engine_type) sp.set("engine_type", params.engine_type);
  if (params.catalog_trim) sp.set("catalog_trim", params.catalog_trim);
  if (params.full_model_code) sp.set("full_model_code", params.full_model_code);
  return sp;
}

/**
 * Legacy shape used by older callers — returns the items array directly.
 * Prefer {@link listVehicleCatalogMatchesWithCount} when you need the
 * `exactCount` signal for auto-match vs. force-pick decisions.
 */
export async function listVehicleCatalogMatches(
  accessToken: string,
  params: VehicleCatalogMatchParams,
): Promise<VehicleCatalogRecord[]> {
  const { items } = await listVehicleCatalogMatchesWithCount(accessToken, params);
  return items;
}

export async function listVehicleCatalogMatchesWithCount(
  accessToken: string,
  params: VehicleCatalogMatchParams,
): Promise<VehicleCatalogMatchResponse> {
  const sp = buildVehicleCatalogMatchSearchParams(params);
  const res = await fetch(
    `${API_ENDPOINTS.fleet}/vehicle-catalog-matches?${sp.toString()}`,
    { headers: edgeHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const items = (data.items || []) as VehicleCatalogRecord[];
  const exactCount = typeof data.exactCount === "number" ? data.exactCount : items.length;
  const truncated = data.truncated === true;
  return { items, exactCount, truncated };
}

/** Tenant-safe: only returns catalog row if org has a vehicle linked to this id (or platform role). */
export async function getFleetVehicleCatalog(
  accessToken: string,
  catalogId: string,
): Promise<VehicleCatalogRecord> {
  const res = await fetch(`${API_ENDPOINTS.fleet}/fleet/vehicle-catalog/${encodeURIComponent(catalogId)}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.item as VehicleCatalogRecord;
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

/** Fleet-scoped open catalog requests for the current organization (banner / align flow). */
export async function listMyPendingCatalogRequests(
  accessToken: string,
  opts?: { fleet_vehicle_id?: string },
): Promise<{ items: VehicleCatalogPendingRequest[] }> {
  const sp = new URLSearchParams();
  if (opts?.fleet_vehicle_id) sp.set("fleet_vehicle_id", opts.fleet_vehicle_id);
  const res = await fetch(`${API_ENDPOINTS.fleet}/vehicle-catalog-pending/my?${sp.toString()}`, {
    headers: edgeHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { items: data.items || [] };
}

export async function requestInfoOnPendingVehicleCatalogRequest(
  accessToken: string,
  id: string,
  message: string,
): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests/${id}/request-info`,
    {
      method: "POST",
      headers: edgeHeaders(accessToken, "application/json"),
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
