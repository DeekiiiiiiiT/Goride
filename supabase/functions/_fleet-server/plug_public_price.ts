import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { resolveFleetGrade } from "../_shared/priceEngineMath.ts";

type FleetPriceEntry = {
  id?: string;
  liters?: number;
  litres?: number;
  amount?: number;
  date?: string;
  organizationId?: string;
  organization_id?: string;
  driverId?: string;
  driver_id?: string;
  vehicleId?: string;
  vehicle_id?: string;
  matchedStationId?: string;
  fuelType?: string;
  pumpPhotoPath?: string;
  gpsAccuracyM?: number;
  metadata?: {
    stationResolutionState?: string;
    matchedStationId?: string;
    fuelType?: string;
    jaaFuelType?: string;
    catalogFuelGrade?: string;
    pumpPhotoPath?: string;
    locationMetadata?: { accuracy?: number };
  };
};

/** Fleet fuel save records a price report. It does not publish the public price. */
export async function submitFleetPriceReport(
  entry: FleetPriceEntry,
  client?: SupabaseClient,
): Promise<void> {
  const fuelEntryId = String(entry.id || "");
  const litres = Number(entry.liters ?? entry.litres) || 0;
  const amount = Number(entry.amount) || 0;
  if (!fuelEntryId || !(litres > 0) || !(amount > 0)) return;

  const sb = client ?? serviceClient();
  if (!sb) return;
  const placeId = entry.matchedStationId || entry.metadata?.matchedStationId || null;
  const catalog = await catalogGrade(sb, entry.vehicleId || entry.vehicle_id, entry.metadata?.catalogFuelGrade);
  const resolved = resolveFleetGrade({
    catalog,
    fill: entry.fuelType || entry.metadata?.fuelType,
    statement: entry.metadata?.jaaFuelType,
  });
  if (resolved.grade === "unknown") return;
  const { error } = await sb.schema("places").from("fleet_price_report").insert({
    fuel_entry_id: fuelEntryId,
    organization_id: entry.organizationId || entry.organization_id || "unknown",
    driver_id: entry.driverId || entry.driver_id || null,
    vehicle_id: entry.vehicleId || entry.vehicle_id || null,
    place_id: placeId,
    grade: resolved.grade,
    grade_source: resolved.source,
    litres,
    amount,
    pump_photo_path: entry.pumpPhotoPath || entry.metadata?.pumpPhotoPath || null,
    station_state: entry.metadata?.stationResolutionState || null,
    gps_accuracy_m: entry.gpsAccuracyM ?? entry.metadata?.locationMetadata?.accuracy ?? null,
    reported_at: entry.date || new Date().toISOString(),
  });
  if (error && !/duplicate key|fuel_entry_id/i.test(error.message)) {
    throw new Error(error.message);
  }
}

async function catalogGrade(sb: SupabaseClient, vehicleId?: string, hinted?: string): Promise<string | null> {
  if (hinted) return hinted;
  if (!vehicleId) return null;
  const vehicle = await sb.schema("fleet").from("vehicles").select("payload_json").eq("id", vehicleId).maybeSingle();
  if (vehicle.error || !vehicle.data) return null;
  const payload = (vehicle.data.payload_json || {}) as Record<string, unknown>;
  if (typeof payload.catalogFuelGrade === "string") return payload.catalogFuelGrade;
  const catalogId = payload.vehicleCatalogId || payload.catalogId;
  if (!catalogId) return null;
  const catalog = await sb.from("vehicle_catalog").select("fuel_grade").eq("id", String(catalogId)).maybeSingle();
  if (catalog.error || !catalog.data) return null;
  return typeof catalog.data.fuel_grade === "string" ? catalog.data.fuel_grade : null;
}

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}
