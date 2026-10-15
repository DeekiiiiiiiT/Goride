/** Scope resolution for GET /vehicle-catalog-pending/my. */

export type MyPendingCatalogScope =
  | { mode: "org"; vehicleId?: string }
  | { mode: "vehicle"; vehicleId: string }
  | { mode: "empty" };

/** Assigned-vehicle scope for drivers (hint must match). */
export function scopeMyPendingCatalogVehicleId(opts: {
  assignedVehicleId: string | null | undefined;
  fleetVehicleIdHint?: string | null;
}): string | null {
  const assigned = (opts.assignedVehicleId ?? "").trim();
  if (!assigned) return null;
  const hint = (opts.fleetVehicleIdHint ?? "").trim();
  if (hint && hint !== assigned) return null;
  return assigned;
}

/**
 * Staff with vehicles.view → org-wide (optional vehicle filter).
 * Drivers → assigned vehicle only.
 */
export function resolveMyPendingCatalogScope(opts: {
  canViewVehicles: boolean;
  assignedVehicleId: string | null | undefined;
  fleetVehicleIdHint?: string | null;
}): MyPendingCatalogScope {
  const hint = (opts.fleetVehicleIdHint ?? "").trim();

  if (opts.canViewVehicles) {
    if (hint) return { mode: "org", vehicleId: hint };
    return { mode: "org" };
  }

  const vehicleId = scopeMyPendingCatalogVehicleId({
    assignedVehicleId: opts.assignedVehicleId,
    fleetVehicleIdHint: hint || null,
  });
  if (!vehicleId) return { mode: "empty" };
  return { mode: "vehicle", vehicleId };
}
