import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { mapFuelGrade, resolveFleetGrade } from "../_shared/priceEngineMath.ts";

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
  type?: string;
  pumpPhotoPath?: string;
  gpsAccuracyM?: number;
  metadata?: {
    stationResolutionState?: string;
    matchedStationId?: string;
    fuelType?: string;
    jaaFuelType?: string;
    jaaMatchedDriverEntryId?: string;
    catalogFuelGrade?: string;
    pumpPhotoPath?: string;
    locationMetadata?: { accuracy?: number };
  };
};

/** Fleet fuel save records a price report. It does not publish the public price. */
export async function syncFleetPriceReport(
  entry: FleetPriceEntry,
  client?: SupabaseClient,
): Promise<void> {
  const fuelEntryId = String(entry.id || "");
  const litres = Number(entry.liters ?? entry.litres) || 0;
  const amount = Number(entry.amount) || 0;
  if (!fuelEntryId || !(litres > 0) || !(amount > 0)) return;

  const sb = client ?? serviceClient();
  if (!sb) return;

  const matchedDriverId = String(entry.metadata?.jaaMatchedDriverEntryId || "").trim();
  if (entry.type === "Card_Transaction" && matchedDriverId) {
    const linked = await sb.schema("places").from("fleet_price_report")
      .select("id, grade")
      .eq("fuel_entry_id", matchedDriverId)
      .maybeSingle();
    if (!linked.error && linked.data) {
      const statement = mapFuelGrade(entry.metadata?.jaaFuelType);
      if (linked.data.grade === "unknown" && statement && statement !== "unknown") {
        const updated = await sb.schema("places").from("fleet_price_report")
          .update({ grade: statement, grade_source: "statement" })
          .eq("fuel_entry_id", matchedDriverId);
        if (updated.error) throw new Error(updated.error.message);
      }
      return;
    }
  }

  const placeId = entry.matchedStationId || entry.metadata?.matchedStationId || null;
  const catalog = await catalogGrade(sb, entry.vehicleId || entry.vehicle_id, entry.metadata?.catalogFuelGrade);
  const resolved = resolveFleetGrade({
    catalog,
    fill: entry.fuelType || entry.metadata?.fuelType,
    statement: entry.metadata?.jaaFuelType,
  });

  const row = {
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
    reported_at: new Date().toISOString(),
  };

  const existing = await sb.schema("places").from("fleet_price_report")
    .select("id, reported_at")
    .eq("fuel_entry_id", fuelEntryId)
    .maybeSingle();
  if (existing.error && !/skip/i.test(existing.error.message || "")) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    const { reported_at: _kept, ...changes } = row;
    const updated = await sb.schema("places").from("fleet_price_report")
      .update(changes)
      .eq("fuel_entry_id", fuelEntryId);
    if (updated.error) throw new Error(updated.error.message);
    return;
  }

  const { error } = await sb.schema("places").from("fleet_price_report").insert(row);
  if (error && !/duplicate key|fuel_entry_id/i.test(error.message)) {
    throw new Error(error.message);
  }
}

/** Kept name. Live fills with no grade are stored and wait in Review. */
export async function submitFleetPriceReport(
  entry: FleetPriceEntry,
  client?: SupabaseClient,
): Promise<void> {
  await syncFleetPriceReport(entry, client);
}

/** A deleted fill stays in the register and is never counted. */
export async function rejectFleetPriceReport(
  fuelEntryId: string,
  client?: SupabaseClient,
): Promise<void> {
  const id = String(fuelEntryId || "").trim();
  if (!id) return;
  const sb = client ?? serviceClient();
  if (!sb) return;
  const existing = await sb.schema("places").from("fleet_price_report")
    .select("id")
    .eq("fuel_entry_id", id)
    .maybeSingle();
  if (existing.error || !existing.data?.id) return;
  const { error } = await sb.schema("places").rpc("price_engine_review", {
    p_source: "fleet",
    p_id: existing.data.id,
    p_decision: "rejected",
    p_note: "fill deleted",
    p_reviewer: null,
  });
  if (error) throw new Error(error.message);
}

async function catalogGrade(sb: SupabaseClient, vehicleId?: string, hinted?: string): Promise<string | null> {
  if (hinted) return hinted;
  if (!vehicleId) return null;
  const vehicle = await sb.schema("fleet").from("vehicles")
    .select("vehicle_catalog_id, payload_json")
    .eq("id", vehicleId)
    .maybeSingle();
  if (vehicle.error || !vehicle.data) return null;
  const payload = (vehicle.data.payload_json || {}) as Record<string, unknown>;
  const catalogId = vehicle.data.vehicle_catalog_id
    || payload.vehicleCatalogId
    || payload.catalogId;
  if (catalogId) {
    const catalog = await sb.from("vehicle_catalog").select("fuel_grade").eq("id", String(catalogId)).maybeSingle();
    if (!catalog.error && typeof catalog.data?.fuel_grade === "string" && catalog.data.fuel_grade) {
      return catalog.data.fuel_grade;
    }
  }
  if (typeof payload.vehicle_catalog_fuel_grade_hint === "string" && payload.vehicle_catalog_fuel_grade_hint) {
    return payload.vehicle_catalog_fuel_grade_hint;
  }
  const settings = payload.fuelSettings;
  if (settings && typeof settings === "object") {
    const fuelType = (settings as { fuelType?: string }).fuelType;
    if (fuelType) return fuelType;
  }
  if (typeof payload.catalogFuelGrade === "string" && payload.catalogFuelGrade) {
    return payload.catalogFuelGrade;
  }
  return null;
}

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}
