/**
 * RB-13: all brake part types for a catalog variant, grouped by brake_role.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { readFindPartsCoverage } from "./parts_catalog_read.ts";
import { assertNoCustomerIdentity } from "./catalog_parts_shape.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BRAKES_SYSTEM_ID = "b1000000-0000-4000-8000-000000000004";

type BrakeRole = "disc" | "drum" | "rear_axle" | "system";

function sectionForRole(role: string | null): "front" | "rear" | "whole" {
  if (role === "disc") return "front";
  if (role === "drum" || role === "rear_axle") return "rear";
  return "whole";
}

export function setupWord(frontType: string, rearType: string): { front: string; rear: string } {
  const front = /disc/i.test(frontType) ? "Disc setup" : frontType ? `${frontType} setup` : "Disc setup";
  const rear = /drum/i.test(rearType) ? "Drum setup" : rearType ? `${rearType} setup` : "Drum setup";
  return { front, rear };
}

/**
 * Spec-fit part types (brake fluid): a sourced car spec counts as on file, plus one
 * per product that matches it. A spec links to a part type through
 * spec_key.maintenance_component_id, spec_key.component_id or part_type_spec_field.
 */
export async function readSpecCounts(
  supabase: SupabaseClient,
  variantId: string,
  vehicleYear: number | null,
): Promise<Map<string, number>> {
  const [{ data: uni, error: uniErr }, { data: keys, error: keyErr }, { data: fields, error: fieldErr }] = await Promise.all([
    supabase.rpc("universal_section_for_variant", { p_catalog_id: variantId, p_vehicle_year: vehicleYear }),
    supabase.from("spec_key").select("key, component_id, maintenance_component_id"),
    supabase.from("part_type_spec_field").select("spec_key, part_type_id"),
  ]);
  if (uniErr) throw uniErr;
  if (keyErr) throw keyErr;
  if (fieldErr) throw fieldErr;
  const typesBySpec = new Map<string, Set<string>>();
  const link = (specKey: unknown, typeId: unknown) => {
    const k = String(specKey ?? "");
    const t = String(typeId ?? "");
    if (!k || !t) return;
    const set = typesBySpec.get(k) ?? new Set<string>();
    set.add(t);
    typesBySpec.set(k, set);
  };
  for (const row of (keys ?? []) as Array<{ key?: string; component_id?: string | null; maintenance_component_id?: string | null }>) {
    link(row.key, row.component_id);
    link(row.key, row.maintenance_component_id);
  }
  for (const row of (fields ?? []) as Array<{ spec_key?: string; part_type_id?: string }>) link(row.spec_key, row.part_type_id);
  const counts = new Map<string, number>();
  for (const spec of (Array.isArray(uni) ? uni : []) as Array<{ specKey?: string; items?: unknown[] }>) {
    const n = Array.isArray(spec.items) && spec.items.length ? spec.items.length : 1;
    for (const typeId of typesBySpec.get(String(spec.specKey ?? "")) ?? []) {
      counts.set(typeId, (counts.get(typeId) ?? 0) + n);
    }
  }
  return counts;
}

export async function readBrakesOverview(
  supabase: SupabaseClient,
  variantId: string,
  vehicleYear: number | null,
) {
  const id = variantId.trim();
  if (!UUID_RE.test(id)) {
    return { error: "Choose a vehicle", status: 400 as const };
  }

  const [{ data: types, error: typeErr }, coverage, { data: variant, error: varErr }, specCounts] = await Promise.all([
    supabase
      .from("maintenance_service_categories")
      .select("id, name, plain_name, op_code, description, brake_role, position_aware, sort_order")
      .eq("parent_id", BRAKES_SYSTEM_ID)
      .eq("is_part", true)
      .order("sort_order"),
    readFindPartsCoverage(supabase, id),
    supabase
      .from("vehicle_catalog")
      .select("front_brake_type, rear_brake_type")
      .eq("id", id)
      .maybeSingle(),
    readSpecCounts(supabase, id, vehicleYear),
  ]);
  if (typeErr) throw typeErr;
  if (varErr) throw varErr;

  const countByComponent = new Map<string, number>();
  for (const row of coverage.areas) countByComponent.set(row.id, row.count);
  for (const [typeId, n] of specCounts) countByComponent.set(typeId, (countByComponent.get(typeId) ?? 0) + n);

  const brakeFront = String((variant as { front_brake_type?: string | null } | null)?.front_brake_type ?? "").trim();
  const brakeRear = String((variant as { rear_brake_type?: string | null } | null)?.rear_brake_type ?? "").trim();
  const setups = setupWord(brakeFront, brakeRear);

  const rows = (types || []) as Array<{
    id: string;
    name?: string;
    plain_name?: string;
    op_code?: string;
    description?: string;
    brake_role?: BrakeRole | null;
  }>;

  const typeRows = rows.map((t) => {
    const componentId = String(t.id);
    const onFileCount = countByComponent.get(componentId) ?? 0;
    const role = (t.brake_role as BrakeRole | null) ?? "system";
    return {
      id: componentId,
      name: String(t.plain_name || t.name || ""),
      opCode: String(t.op_code || ""),
      description: String(t.description || ""),
      brakeRole: role,
      section: sectionForRole(role),
      onFile: onFileCount > 0,
      onFileCount,
    };
  });

  const frontTypes = typeRows.filter((r) => r.section === "front");
  const rearTypes = typeRows.filter((r) => r.section === "rear");
  const wholeTypes = typeRows.filter((r) => r.section === "whole");

  const payload = {
    variantId: id,
    vehicleYear,
    brakeFrontType: brakeFront || null,
    brakeRearType: brakeRear || null,
    frontSetup: setups.front,
    rearSetup: setups.rear,
    hasBrakeSpecs: Boolean(brakeFront || brakeRear),
    groups: {
      front: { setup: setups.front, componentCount: frontTypes.length, types: frontTypes },
      rear: { setup: setups.rear, componentCount: rearTypes.length, types: rearTypes },
      whole: { setup: "Whole vehicle", componentCount: wholeTypes.length, types: wholeTypes },
    },
    types: typeRows,
  };

  assertNoCustomerIdentity(payload);
  return { body: payload, status: 200 as const };
}
