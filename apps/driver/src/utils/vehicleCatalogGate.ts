import type { Vehicle, VehicleCatalogStatus, VehicleStatus } from "../types/vehicle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CatalogGateVehicleShape = {
  vehicle_catalog_id?: string | null;
  catalogStatus?: VehicleCatalogStatus | null;
  status?: VehicleStatus;
};

export function isVehicleCatalogMatched(v: CatalogGateVehicleShape | null | undefined): boolean {
  if (!v) return false;
  const id = typeof v.vehicle_catalog_id === "string" ? v.vehicle_catalog_id.trim() : "";
  if (!UUID_RE.test(id)) return false;
  if (v.catalogStatus && v.catalogStatus !== "matched") return false;
  return true;
}

export function isVehicleParked(v: CatalogGateVehicleShape | null | undefined): boolean {
  return !isVehicleCatalogMatched(v);
}

export const PARKED_VEHICLE_ALLOWED_STATUSES: readonly VehicleStatus[] = [
  "Inactive",
  "Decommissioned",
] as const;

export function isStatusTransitionAllowedForCatalog(
  v: CatalogGateVehicleShape | null | undefined,
  nextStatus: VehicleStatus | undefined,
): boolean {
  if (!nextStatus) return true;
  if (isVehicleCatalogMatched(v)) return true;
  return PARKED_VEHICLE_ALLOWED_STATUSES.includes(nextStatus);
}

export const VEHICLE_PENDING_CATALOG_ERROR_CODE = "VEHICLE_PENDING_CATALOG" as const;

export function catalogStatusLabel(s: VehicleCatalogStatus | null | undefined): string {
  switch (s) {
    case "matched":
      return "Matched";
    case "needs_info":
      return "Needs info";
    case "pending_catalog":
    default:
      return "Pending catalog";
  }
}

export function deriveCatalogStatus(v: Vehicle | CatalogGateVehicleShape | null | undefined): VehicleCatalogStatus {
  if (!v) return "pending_catalog";
  if (v.catalogStatus) return v.catalogStatus;
  const id = typeof v.vehicle_catalog_id === "string" ? v.vehicle_catalog_id.trim() : "";
  return UUID_RE.test(id) ? "matched" : "pending_catalog";
}