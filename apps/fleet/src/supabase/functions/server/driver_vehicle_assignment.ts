/**
 * Canonical driver ↔ vehicle assignment resolution.
 *
 * Source of truth: vehicle.currentDriverId (fleet assignment UI).
 * driver.assignedVehicleId is a mirrored cache updated on vehicle save.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export type VehicleAssignmentSource =
  | "payload"
  | "vehicle_current_driver"
  | "driver_assigned_vehicle"
  | "none";

export interface ResolvedVehicleAssignment {
  vehicleId: string | null;
  vehicle: Record<string, unknown> | null;
  source: VehicleAssignmentSource;
}

/** Roam UUID + linked platform IDs + lowercase variants. */
export async function expandDriverIdVariants(
  raw: string | undefined | null,
): Promise<string[]> {
  const trimmed = raw != null && String(raw).trim() ? String(raw).trim() : "";
  if (!trimmed) return [];

  const ids: string[] = [trimmed];
  try {
    const driverRecord = await kv.get(`driver:${trimmed}`);
    if (driverRecord && typeof driverRecord === "object") {
      const dr = driverRecord as Record<string, unknown>;
      if (dr.driverId && String(dr.driverId).trim()) {
        ids.push(String(dr.driverId).trim());
      }
      if (dr.uberDriverId) ids.push(String(dr.uberDriverId).trim());
      if (dr.inDriveDriverId) ids.push(String(dr.inDriveDriverId).trim());
      if (dr.assignedVehicleId) {
        // not an id variant — used elsewhere
      }
    }
  } catch {
    /* ignore */
  }

  const out: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    out.push(id);
    const lc = id.toLowerCase();
    if (lc !== id) out.push(lc);
  }
  return [...new Set(out)];
}

function orgMatches(
  record: Record<string, unknown>,
  organizationId?: string | null,
): boolean {
  if (!organizationId) return true;
  const ro = record.organizationId;
  if (ro == null || ro === "") return true; // legacy un-stamped rows
  return String(ro) === String(organizationId);
}

function pickBestVehicle(
  vehicles: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (vehicles.length === 0) return null;
  const active = vehicles.filter((v) => String(v.status || "").toLowerCase() === "active");
  const pool = active.length > 0 ? active : vehicles;
  return pool[0] ?? null;
}

/**
 * Resolve the fleet-assigned vehicle for a driver.
 * Prefer vehicle.currentDriverId match; fall back to driver.assignedVehicleId.
 */
export async function resolveDriverVehicleAssignment(
  driverId: string | undefined | null,
  options?: {
    organizationId?: string | null;
    hintVehicleId?: string | null;
  },
): Promise<ResolvedVehicleAssignment> {
  if (!driverId || !String(driverId).trim()) {
    const hintOnly =
      options?.hintVehicleId != null && String(options.hintVehicleId).trim()
        ? String(options.hintVehicleId).trim()
        : null;
    if (hintOnly) {
      const hinted = await kv.get(`vehicle:${hintOnly}`);
      if (hinted && typeof hinted === "object") {
        return {
          vehicleId: hintOnly,
          vehicle: hinted as Record<string, unknown>,
          source: "payload",
        };
      }
    }
    return { vehicleId: null, vehicle: null, source: "none" };
  }

  const variants = await expandDriverIdVariants(driverId);
  if (variants.length > 0) {
    const orFilter = variants
      .map((id) => `value->>currentDriverId.eq.${id}`)
      .join(",");

    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "vehicle:%")
      .or(orFilter);

    if (!error && data?.length) {
      const matches = data
        .map((row: { value: unknown }) => row.value as Record<string, unknown>)
        .filter((v) => orgMatches(v, options?.organizationId));

      const chosen = pickBestVehicle(matches);
      if (chosen?.id) {
        return {
          vehicleId: String(chosen.id),
          vehicle: chosen,
          source: "vehicle_current_driver",
        };
      }
    }
  }

  const hint =
    options?.hintVehicleId != null && String(options.hintVehicleId).trim()
      ? String(options.hintVehicleId).trim()
      : null;

  if (hint) {
    const hinted = await kv.get(`vehicle:${hint}`);
    if (hinted && typeof hinted === "object" && orgMatches(hinted, options?.organizationId)) {
      return {
        vehicleId: hint,
        vehicle: hinted as Record<string, unknown>,
        source: "payload",
      };
    }
  }

  for (const variant of variants) {
    const driver = await kv.get(`driver:${variant}`);
    const assigned = driver?.assignedVehicleId || driver?.vehicle;
    if (assigned && String(assigned).trim()) {
      const vehicle = await kv.get(`vehicle:${String(assigned).trim()}`);
      if (vehicle && orgMatches(vehicle, options?.organizationId)) {
        return {
          vehicleId: String(assigned).trim(),
          vehicle: vehicle as Record<string, unknown>,
          source: "driver_assigned_vehicle",
        };
      }
    }
  }

  return { vehicleId: null, vehicle: null, source: "none" };
}

/** Stamp vehicleId (and optional plate) on a fuel transaction or fuel_entry payload. */
export async function enrichRecordWithDriverVehicle<
  T extends Record<string, unknown>,
>(record: T, organizationId?: string | null): Promise<T> {
  const driverId =
    (record.driverId as string | undefined) ||
    (record.driver_id as string | undefined);
  const hint =
    (record.vehicleId as string | undefined) ||
    (record.vehicle_id as string | undefined);

  const resolved = await resolveDriverVehicleAssignment(driverId, {
    organizationId,
    hintVehicleId: hint,
  });

  if (!resolved.vehicleId) return record;

  const next = { ...record, vehicleId: resolved.vehicleId } as T;
  const vehicle = resolved.vehicle;
  if (vehicle) {
    const plate = vehicle.plateNumber || vehicle.licensePlate;
    if (plate && !next.vehiclePlate) {
      (next as Record<string, unknown>).vehiclePlate = plate;
    }
  }
  return next;
}

/** Mirror fleet vehicle assignment onto the driver KV record. */
export async function syncDriverRecordFromVehicleAssignment(
  vehicle: Record<string, unknown>,
): Promise<void> {
  const vehicleId = vehicle.id != null ? String(vehicle.id) : "";
  const currentDriverId =
    vehicle.currentDriverId != null ? String(vehicle.currentDriverId) : "";
  if (!vehicleId || !currentDriverId) return;

  const existing = await kv.get(`driver:${currentDriverId}`);
  const plate = vehicle.plateNumber || vehicle.licensePlate || "";
  const vehicleName =
    vehicle.vehicleName ||
    `${vehicle.make || ""} ${vehicle.model || ""}`.trim();

  await kv.set(`driver:${currentDriverId}`, {
    ...(existing && typeof existing === "object" ? existing : {}),
    id: existing?.id || currentDriverId,
    driverId: existing?.driverId || currentDriverId,
    assignedVehicleId: vehicleId,
    assignedVehiclePlate: plate,
    assignedVehicleName: vehicleName,
    vehicle: vehicleId,
  });

  const { backfillMissingVehicleOnDriverFuelRecords } = await import(
    "./fuel_transaction_sync.ts"
  );
  await backfillMissingVehicleOnDriverFuelRecords(
    currentDriverId,
    vehicleId,
    vehicle.organizationId as string | undefined,
  );
}
