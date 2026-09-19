/**
 * Vehicle custody lifecycle — assignment ≠ possession.
 * States: none → assigned → handed_over → in_custody
 */

export type VehicleCustodyStatus = "none" | "assigned" | "handed_over" | "in_custody";

export function normalizeCustodyStatus(raw: unknown): VehicleCustodyStatus {
  const s = String(raw ?? "").trim();
  if (s === "assigned" || s === "handed_over" || s === "in_custody" || s === "none") return s;
  return "none";
}

/** When driver assignment changes, reset custody to a clean starting state. */
export function applyCustodyResetOnAssignmentChange(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const prevId = previous?.currentDriverId != null ? String(previous.currentDriverId).trim() : "";
  const nextId = next.currentDriverId != null ? String(next.currentDriverId).trim() : "";
  if (prevId === nextId) {
    // Ensure a status exists when a driver is present
    if (nextId && !next.custodyStatus) {
      return { ...next, custodyStatus: "assigned" };
    }
    if (!nextId && next.custodyStatus && next.custodyStatus !== "none") {
      return clearCustodyFields({ ...next, custodyStatus: "none" });
    }
    return next;
  }

  if (!nextId) {
    return clearCustodyFields({ ...next, custodyStatus: "none" });
  }

  return clearCustodyFields({
    ...next,
    custodyStatus: "assigned",
  });
}

function clearCustodyFields(v: Record<string, unknown>): Record<string, unknown> {
  const out = { ...v };
  delete out.handedOverAt;
  delete out.handedOverBy;
  delete out.custodyConfirmedAt;
  delete out.custodyConfirmedBy;
  return out;
}

export function vehicleHasDriverCustody(vehicle: Record<string, unknown> | null | undefined): boolean {
  if (!vehicle) return false;
  return normalizeCustodyStatus(vehicle.custodyStatus) === "in_custody";
}
