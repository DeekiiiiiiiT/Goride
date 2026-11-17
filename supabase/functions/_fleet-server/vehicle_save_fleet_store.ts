import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { DocumentCheckRow, FleetVehicleRow, FleetVehicleStore } from "./vehicle_save_rules.ts";

export function createFleetVehicleStore(supabase: SupabaseClient): FleetVehicleStore {
  return {
    async getVehicle(id) {
      const { data, error } = await supabase
        .from("fleet_vehicles")
        .select("id, organization_id, license_plate, vehicle_catalog_id, color_standard, picture_id, make, model, year, legacy_kv_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as FleetVehicleRow | null) ?? null;
    },

    async tryInsert(row) {
      const { error } = await supabase.from("fleet_vehicles").insert({
        id: row.id,
        organization_id: row.organization_id,
        license_plate: row.license_plate,
        vehicle_catalog_id: row.vehicle_catalog_id ?? null,
        color_standard: row.color_standard ?? null,
        picture_id: row.picture_id ?? null,
        make: row.make ?? null,
        model: row.model ?? null,
        year: row.year ?? null,
        legacy_kv_id: row.legacy_kv_id ?? `vehicle:${row.id}`,
        status: "Inactive",
      });
      if (error) {
        if (error.code === "23505") return "conflict";
        throw error;
      }
      return "inserted";
    },

    async updateVehicle(id, patch) {
      const { error } = await supabase.from("fleet_vehicles").update(patch).eq("id", id);
      if (error) throw error;
    },

    async insertDocumentCheck(row) {
      const { error } = await supabase.from("fleet_vehicle_document_check").insert({
        organization_id: row.organization_id,
        vehicle_id: row.vehicle_id,
        doc_type: row.doc_type,
        issue_date: row.issue_date,
        expiry_date: row.expiry_date,
        file_sha256: row.file_sha256,
        fields_json: row.fields_json,
        read_by: row.read_by,
        reader_provider: row.reader_provider,
        reader_model: row.reader_model,
      });
      if (error) throw error;
    },

    async getLatestRegistrationCheck(vehicleId, orgId) {
      const { data, error } = await supabase
        .from("fleet_vehicle_document_check")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .eq("organization_id", orgId)
        .eq("doc_type", "registration")
        .order("read_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as DocumentCheckRow | null) ?? null;
    },
  };
}