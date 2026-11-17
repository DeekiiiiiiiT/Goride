import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createFleetVehicleStore } from "./vehicle_save_fleet_store.ts";
import { createProductionPictureLookupDeps, runPictureLookup } from "./vehicle_picture_lookup.ts";

export async function runPictureLookupAfterCatalogLink(
  supabase: SupabaseClient,
  fleetVehicleId: string,
  catalogId: string,
  prevCatalogId: string | null,
  catalogStatus: string | null,
): Promise<void> {
  const store = createFleetVehicleStore(supabase);
  const row = await store.getVehicle(fleetVehicleId);
  if (!row) return;
  const catalogChanged = String(prevCatalogId ?? "") !== String(catalogId);
  await store.updateVehicle(fleetVehicleId, {
    vehicle_catalog_id: catalogId,
    picture_id: catalogChanged ? null : row.picture_id,
  });
  const deps = createProductionPictureLookupDeps(supabase);
  await runPictureLookup(deps, {
    vehicleId: fleetVehicleId,
    organizationId: row.organization_id,
    vehicleCatalogId: catalogId,
    colorStandard: row.color_standard ?? null,
    catalogStatus: catalogStatus ?? "matched",
  });
}