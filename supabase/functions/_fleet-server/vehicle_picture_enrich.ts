import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createProductionPictureLookupDeps, readPicturesForVehiclesBatch } from "./vehicle_picture_lookup.ts";
import type { PicturePayload } from "./vehicle_picture_types.ts";

export type VehicleWithPicture = Record<string, unknown> & { picture?: PicturePayload };

export async function enrichVehiclesWithPictures(
  supabase: SupabaseClient,
  vehicles: Record<string, unknown>[],
): Promise<VehicleWithPicture[]> {
  if (!vehicles.length) return [];
  const ids = vehicles.map((v) => String(v.id ?? "")).filter(Boolean);
  if (!ids.length) return vehicles;
  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select("id, organization_id, vehicle_catalog_id, color_standard, picture_id")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((r) => [String(r.id), r]));
  const deps = createProductionPictureLookupDeps(supabase);

  const contexts = vehicles
    .map((v) => {
      const id = String(v.id ?? "");
      const row = byId.get(id);
      if (!row) return null;
      const orgId = String(v.organizationId ?? v.organization_id ?? row.organization_id ?? "");
      return {
        vehicleId: id,
        organizationId: orgId,
        vehicleCatalogId: row.vehicle_catalog_id,
        colorStandard: row.color_standard,
        pictureId: row.picture_id,
        catalogStatus: typeof v.catalogStatus === "string" ? v.catalogStatus : null,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c != null);

  const picturesById = await readPicturesForVehiclesBatch(deps, contexts);

  const out: VehicleWithPicture[] = [];
  for (const v of vehicles) {
    const id = String(v.id ?? "");
    const row = byId.get(id);
    if (!row) {
      out.push({ ...v, picture: { status: "none", url: null } });
      continue;
    }
    const picture = picturesById.get(id) ?? { status: "none", url: null };
    // The standard colour lives on the fleet row, not in the KV vehicle; the vehicle page's colour chip needs it.
    out.push({ ...v, picture, colorStandard: row.color_standard ?? null });
  }
  return out;
}