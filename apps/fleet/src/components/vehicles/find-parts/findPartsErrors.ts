import { FleetCoreRequestError, getLastFleetCoreLatencyMs } from "../../../services/api";

export function fleetCoreErrorDetails(err: unknown): { status: number; message: string } {
  if (err instanceof FleetCoreRequestError) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof Error) return { status: 0, message: err.message };
  return { status: 0, message: "Could not load parts" };
}

export function formatFindPartsVehicleChip(label: string, plate?: string): string {
  const base = label.trim();
  const p = plate?.trim();
  if (base && p) return `${base} [${p}]`;
  return base || p || "Vehicle";
}

export function findPartsConnectionLatencyMs(): number | null {
  return getLastFleetCoreLatencyMs();
}
