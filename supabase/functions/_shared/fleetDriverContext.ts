/**
 * Fleet driver context for the rides domain.
 * Bridges driver_profiles (mode/fleet_id) with fleet KV records
 * (driver:{uid}.assignedVehicleId, vehicle:{id}) so dispatch and
 * ride→fleet sync can attribute org + vehicle without HTTP round-trips.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const KV_TABLE = "kv_store_37f42386";

function publicDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export interface FleetDriverContext {
  mode: "fleet" | "independent" | null;
  fleetId: string | null;
  /** Org actually stamped on trips: driver_profiles.fleet_id, falling back to KV driver.organizationId. */
  organizationId: string | null;
  assignedVehicleId: string | null;
  assignedVehiclePlate: string | null;
  /** Raw fleet KV vehicle record (bodyType, plateNumber, …) when assigned. */
  vehicle: Record<string, unknown> | null;
}

async function kvGet(db: SupabaseClient, key: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from(KV_TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.warn(`[fleetDriverContext] kv get failed for ${key}:`, error.message);
    return null;
  }
  const value = (data as { value?: unknown } | null)?.value;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export async function getFleetDriverContext(userId: string): Promise<FleetDriverContext> {
  const empty: FleetDriverContext = {
    mode: null,
    fleetId: null,
    organizationId: null,
    assignedVehicleId: null,
    assignedVehiclePlate: null,
    vehicle: null,
  };
  if (!userId) return empty;

  const db = publicDb();
  const { data: profile, error } = await db
    .from("driver_profiles")
    .select("mode, fleet_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[fleetDriverContext] profile lookup failed:", error.message);
  }

  const mode = profile?.mode === "fleet" || profile?.mode === "independent"
    ? profile.mode as "fleet" | "independent"
    : null;
  const fleetId = profile?.fleet_id ? String(profile.fleet_id) : null;

  const driverKv = await kvGet(db, `driver:${userId}`);
  const kvOrg = driverKv?.organizationId ? String(driverKv.organizationId) : null;
  const organizationId = fleetId ?? kvOrg;

  // Prefer vehicle.currentDriverId (assignment SSOT) over the mirrored driver cache.
  let assignedVehicleId: string | null = null;
  let vehicle: Record<string, unknown> | null = null;
  const { data: byCurrentDriver, error: vehErr } = await db
    .from(KV_TABLE)
    .select("value")
    .like("key", "vehicle:%")
    .eq("value->>currentDriverId", userId)
    .limit(5);
  if (vehErr) {
    console.warn("[fleetDriverContext] vehicle lookup failed:", vehErr.message);
  }
  const candidates = (byCurrentDriver ?? [])
    .map((row: { value: unknown }) => row.value as Record<string, unknown>)
    .filter((v) => v && typeof v === "object");
  const active = candidates.find((v) => String(v.status || "").toLowerCase() === "active");
  vehicle = active ?? candidates[0] ?? null;

  if (!vehicle) {
    const cachedId = driverKv?.assignedVehicleId || driverKv?.vehicle;
    if (cachedId && String(cachedId).trim()) {
      vehicle = await kvGet(db, `vehicle:${String(cachedId).trim()}`);
      if (vehicle) assignedVehicleId = String(cachedId).trim();
    }
  } else {
    assignedVehicleId = vehicle.id != null ? String(vehicle.id) : null;
  }

  const assignedVehiclePlate = vehicle
    ? String(vehicle.plateNumber || vehicle.licensePlate || "") || null
    : null;

  return { mode, fleetId, organizationId, assignedVehicleId, assignedVehiclePlate, vehicle };
}

/** Body-type label from the assigned fleet vehicle (e.g. "Sedan", "SUV"), if any. */
export function fleetVehicleBodyTypeLabel(ctx: FleetDriverContext): string | null {
  const label = ctx.vehicle?.bodyType;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}
