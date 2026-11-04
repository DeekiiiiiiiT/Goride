/**
 * Parallel scoped recomputes on overlapping car scope (AM gate proof 35/44 companion).
 * Requires local Supabase: PARTS_AUTO_MATCH_CONCURRENCY=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const runConcurrency = Deno.env.get("PARTS_AUTO_MATCH_CONCURRENCY") === "1";

const CAR = "a9000005-0000-4000-8000-0000000000fa";
const GRP_A = "a9000006-0000-4000-8000-0000000000fa";
const GRP_B = "a9000006-0000-4000-8000-0000000000fb";
const PART_A = "a9000007-0000-4000-8000-0000000000fa";
const PART_B = "a9000007-0000-4000-8000-0000000000fb";
const VON_A = "a9000008-0000-4000-8000-0000000000fa";
const VON_B = "a9000008-0000-4000-8000-0000000000fb";
const PLATFORM = "a9000002-0000-4000-8000-000000000004";
const ENGINE = "a9000001-0000-4000-8000-000000000002";
const CATEGORY = "a9000004-0000-4000-8000-000000000001";
const COMPONENT = "a9000003-0000-4000-8000-000000000002";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

type DerivedRow = {
  interchange_group_id: string;
  vehicle_catalog_id: string;
  position: string | null;
  side: string | null;
  status: string;
  reason_code: string;
};

function snapshot(rows: DerivedRow[]): string {
  const sorted = [...rows].sort((a, b) =>
    `${a.interchange_group_id}:${a.position}:${a.side}`.localeCompare(
      `${b.interchange_group_id}:${b.position}:${b.side}`,
    )
  );
  return JSON.stringify(sorted);
}

async function loadDerived(sb: ReturnType<typeof serviceClient>, carId: string): Promise<DerivedRow[]> {
  const { data, error } = await sb.from("part_fit_derived")
    .select("interchange_group_id, vehicle_catalog_id, position, side, status, reason_code")
    .eq("vehicle_catalog_id", carId)
    .in("interchange_group_id", [GRP_A, GRP_B]);
  if (error) throw error;
  return (data ?? []) as DerivedRow[];
}

function must(label: string, res: { error: unknown }) {
  if (res.error) throw new Error(`seed ${label}: ${JSON.stringify(res.error)}`);
}

async function seedFixture(sb: ReturnType<typeof serviceClient>) {
  // Self-contained: a fresh local stack has none of the base rows.
  must("engine_family", await sb.from("engine_family").upsert({ id: ENGINE, code: "AM-Fiesta" }, { onConflict: "id" }));
  must("vehicle_platform", await sb.from("vehicle_platform").upsert(
    { id: PLATFORM, code: "DE", maker: "Mazda", label: "Mazda2" },
    { onConflict: "id" },
  ));
  must("maintenance_service_categories", await sb.from("maintenance_service_categories").upsert([
    { id: "a9000003-0000-4000-8000-000000000001", code: "am-brakes", name: "Brakes", kind: "system", op_code: "BRK", parent_id: null, icon_key: "brakes", sort_order: 1 },
    { id: COMPONENT, code: "am-brk-pads", name: "Brake pads", kind: "component", op_code: "BRK-PADS", parent_id: "a9000003-0000-4000-8000-000000000001", icon_key: "brakes", sort_order: 2 },
  ], { onConflict: "id" }));
  must("part_category", await sb.from("part_category").upsert(
    { id: CATEGORY, slug: "am-brakes", label: "Brakes", sort_order: 1 },
    { onConflict: "id" },
  ));
  must("vehicle_catalog", await sb.from("vehicle_catalog").upsert({
    id: CAR,
    make: "Mazda",
    model: "ConcTest",
    chassis_code: "CT",
    production_start_year: 2010,
    production_end_year: 2014,
    platform_id: PLATFORM,
    engine_family_id: ENGINE,
  }, { onConflict: "id" }));
  must("part_interchange_group", await sb.from("part_interchange_group").upsert([
    { id: GRP_A, code: "AM-CONC-A", fit_scope: "body" },
    { id: GRP_B, code: "AM-CONC-B", fit_scope: "body" },
  ], { onConflict: "id" }));
  must("part_master", await sb.from("part_master").upsert([
    {
      id: PART_A,
      category_id: CATEGORY,
      name: "Conc A",
      oem_part_number: "CONC-A",
      manufacturer: "Mazda",
      part_kind: "oem",
      interchange_group_id: GRP_A,
      maintenance_component_id: COMPONENT,
      catalog_decision: "confirmed",
      evidence_url: "https://example.com/conc-a",
    },
    {
      id: PART_B,
      category_id: CATEGORY,
      name: "Conc B",
      oem_part_number: "CONC-B",
      manufacturer: "Mazda",
      part_kind: "oem",
      interchange_group_id: GRP_B,
      maintenance_component_id: COMPONENT,
      catalog_decision: "confirmed",
      evidence_url: "https://example.com/conc-b",
    },
  ], { onConflict: "id" }));
  must("vehicle_oe_number", await sb.from("vehicle_oe_number").upsert([
    {
      id: VON_A,
      vehicle_catalog_id: CAR,
      maintenance_component_id: COMPONENT,
      position: "front",
      side: "left",
      oe_brand: "Mazda",
      oe_number: "CONC-A",
      oe_number_norm: "CONCA",
      evidence_url: "https://example.com/conc-oe-a",
    },
    {
      id: VON_B,
      vehicle_catalog_id: CAR,
      maintenance_component_id: COMPONENT,
      position: "front",
      side: "right",
      oe_brand: "Mazda",
      oe_number: "CONC-B",
      oe_number_norm: "CONCB",
      evidence_url: "https://example.com/conc-oe-b",
    },
  ], { onConflict: "id" }));
  await sb.from("part_fit_derived").delete().eq("vehicle_catalog_id", CAR);
}

Deno.test({
  name: "parallel scoped recomputes finish and match sequential derived rows",
  ignore: !runConcurrency,
  fn: async () => {
    const sbA = serviceClient();
    const sbB = serviceClient();
    await seedFixture(sbA);

    const seqA = await sbA.rpc("part_match_recompute", { p_group_id: GRP_A, p_vehicle_id: CAR });
    if (seqA.error) throw seqA.error;
    const seqB = await sbA.rpc("part_match_recompute", { p_group_id: GRP_B, p_vehicle_id: CAR });
    if (seqB.error) throw seqB.error;
    const sequential = snapshot(await loadDerived(sbA, CAR));

    await sbA.from("part_fit_derived").delete().eq("vehicle_catalog_id", CAR);

    const [parA, parB] = await Promise.all([
      sbA.rpc("part_match_recompute", { p_group_id: GRP_A, p_vehicle_id: CAR }),
      sbB.rpc("part_match_recompute", { p_group_id: GRP_B, p_vehicle_id: CAR }),
    ]);
    if (parA.error) throw parA.error;
    if (parB.error) throw parB.error;

    const parallel = snapshot(await loadDerived(sbA, CAR));
    assertEquals(parallel, sequential);
    assertEquals(JSON.parse(parallel).length, 2);
  },
});
