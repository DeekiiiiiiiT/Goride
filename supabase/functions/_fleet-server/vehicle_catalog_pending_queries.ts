/**
 * DB helpers for vehicle_catalog_pending_requests (edge service role).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function parseYear(v: unknown): number {
  const n = parseInt(String(v ?? "").trim(), 10);
  if (Number.isFinite(n) && n >= 1900 && n <= 2100) return n;
  return new Date().getFullYear();
}

function pickStrVehicle(v: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const x = v[k];
    if (typeof x === "string" && x.trim() !== "") return x.trim();
  }
  return null;
}

function parseFleetProductionMonth(v: Record<string, unknown>): number | null {
  for (const k of ["vehicle_catalog_production_month_hint", "vehicle_manufacture_month"]) {
    const x = v[k];
    if (x === undefined || x === null || x === "") continue;
    const n = typeof x === "number" ? x : parseInt(String(x).trim(), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  }
  return null;
}

export async function upsertPendingFromKvVehicle(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    fleetVehicleId: string;
    vehicle: Record<string, unknown>;
    source: "scan" | "manual";
  },
): Promise<void> {
  const proposed_make = String(args.vehicle.make ?? "").trim() || "Unknown";
  const proposed_model = String(args.vehicle.model ?? "").trim() || "Unknown";
  const y = parseYear(args.vehicle.year);
  const proposed_production_start_year = y;
  const proposed_production_end_year = y;
  // Bugfix: previously hard-coded to null. Now reads the trim hint that
  // AddVehicleModal / VehicleDetail send so admins see what the operator entered.
  const proposed_trim = pickStrVehicle(args.vehicle, [
    "vehicle_catalog_trim_hint",
    "trim_series",
    "trim",
  ]);
  const proposed_body_type = args.vehicle.bodyType != null
    ? String(args.vehicle.bodyType).trim() || null
    : null;
  const month = parseFleetProductionMonth(args.vehicle);
  let proposed_production_start_month: number;
  let proposed_production_end_month: number | null;
  if (proposed_production_end_year == null) {
    proposed_production_start_month = month ?? 1;
    proposed_production_end_month = null;
  } else if (proposed_production_start_year === proposed_production_end_year) {
    proposed_production_start_month = month ?? 1;
    proposed_production_end_month = month ?? 12;
  } else {
    proposed_production_start_month = month ?? 1;
    proposed_production_end_month = 12;
  }

  const { data: existing, error: selErr } = await supabase
    .from("vehicle_catalog_pending_requests")
    .select("id")
    .eq("organization_id", args.organizationId)
    .eq("fleet_vehicle_id", args.fleetVehicleId)
    .in("status", ["pending", "needs_info"])
    .maybeSingle();
  if (selErr) throw selErr;

  // Bugfix: engine code was declared on the type but never written.
  const proposed_engine_code = pickStrVehicle(args.vehicle, [
    "vehicle_catalog_engine_code_hint",
    "engine_code",
  ]);
  // Hybrid catalog matching: persist the new disambiguators so admins reviewing
  // the pending request see exactly what the fleet operator picked.
  const proposed_drivetrain = pickStrVehicle(args.vehicle, [
    "vehicle_catalog_drivetrain_hint",
    "drivetrain",
  ]);
  const proposed_transmission = pickStrVehicle(args.vehicle, [
    "vehicle_catalog_transmission_hint",
    "transmission",
  ]);
  const proposed_fuel_type = pickStrVehicle(args.vehicle, [
    "vehicle_catalog_fuel_type_hint",
    "fuel_type",
    "fuelType",
  ]);

  const rowBase: Record<string, unknown> = {
    organization_id: args.organizationId,
    fleet_vehicle_id: args.fleetVehicleId,
    proposed_make,
    proposed_model,
    proposed_production_start_year,
    proposed_production_end_year,
    proposed_production_start_month,
    proposed_production_end_month,
    proposed_trim_series: proposed_trim,
    proposed_engine_code,
    proposed_full_model_code: pickStrVehicle(args.vehicle, [
      "vehicle_catalog_full_model_code_hint",
      "full_model_code",
    ]),
    proposed_catalog_trim: pickStrVehicle(args.vehicle, ["vehicle_catalog_catalog_trim_hint", "catalog_trim"]),
    proposed_emissions_prefix: pickStrVehicle(args.vehicle, [
      "vehicle_catalog_emissions_prefix_hint",
      "emissions_prefix",
    ]),
    proposed_trim_suffix_code: pickStrVehicle(args.vehicle, [
      "vehicle_catalog_trim_suffix_hint",
      "trim_suffix_code",
    ]),
    proposed_fuel_category: pickStrVehicle(args.vehicle, ["vehicle_catalog_fuel_category_hint"]),
    proposed_fuel_grade: pickStrVehicle(args.vehicle, ["vehicle_catalog_fuel_grade_hint"]),
    proposed_drivetrain,
    proposed_transmission,
    proposed_fuel_type,
    proposed_body_type,
    source: args.source,
    updated_at: new Date().toISOString(),
  };

  // Optional columns (added in a later migration) are stripped on legacy DBs
  // so the upsert doesn't break customers who haven't run the migration yet.
  const OPTIONAL_NEW_COLUMNS = ["proposed_drivetrain", "proposed_transmission", "proposed_fuel_type"] as const;
  const isMissingColumnError = (err: unknown): string | null => {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    for (const col of OPTIONAL_NEW_COLUMNS) {
      if (msg.includes(col) && /column|schema|cache|not found|does not exist|could not find/i.test(msg)) {
        return col;
      }
    }
    return null;
  };

  const writeWithFallback = async (row: Record<string, unknown>): Promise<void> => {
    let attempt = { ...row };
    for (let i = 0; i < OPTIONAL_NEW_COLUMNS.length + 1; i++) {
      const op = existing?.id
        ? supabase.from("vehicle_catalog_pending_requests").update(attempt).eq("id", existing.id)
        : supabase.from("vehicle_catalog_pending_requests").insert({
          ...attempt,
          status: "pending" as const,
          created_at: new Date().toISOString(),
        });
      const { error } = await op;
      if (!error) return;
      const missing = isMissingColumnError(error);
      if (!missing) throw error;
      console.warn(`[pending-upsert] dropping optional column ${missing} (legacy schema)`);
      delete attempt[missing];
    }
  };

  await writeWithFallback(rowBase);
}

export async function supersedePendingRequestsForVehicle(
  supabase: SupabaseClient,
  organizationId: string,
  fleetVehicleId: string,
): Promise<void> {
  const { error } = await supabase
    .from("vehicle_catalog_pending_requests")
    .update({
      status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("fleet_vehicle_id", fleetVehicleId)
    .in("status", ["pending", "needs_info"]);
  if (error) throw error;
}
