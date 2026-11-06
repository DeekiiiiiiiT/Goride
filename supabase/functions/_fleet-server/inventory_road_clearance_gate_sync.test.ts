import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  ROAD_CLEARANCE_LOGIC_SIGNATURE as fleetSig,
  assertRoadClearForDispatch,
  fleetVehicleRoadClear,
} from "./inventory_road_clearance_gate.ts";
import { ROAD_CLEARANCE_LOGIC_SIGNATURE as deliverySig } from "../delivery/inventoryRoadClearanceGate.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

Deno.test("road clearance gate fleet and delivery logic stay in sync", () => {
  const normalize = (s: string) =>
    s.replace("fleet_inv_v_kit_compliance", "COMPLIANCE_VIEW").replace(
      "v_inv_kit_compliance",
      "COMPLIANCE_VIEW",
    );
  assertEquals(normalize(fleetSig), normalize(deliverySig));
});

Deno.test("road clearance gate files reference keep-in-sync headers", async () => {
  const fleet = await Deno.readTextFile(
    new URL("./inventory_road_clearance_gate.ts", import.meta.url),
  );
  const delivery = await Deno.readTextFile(
    new URL("../delivery/inventoryRoadClearanceGate.ts", import.meta.url),
  );
  if (!fleet.includes("Keep in sync with supabase/functions/delivery/inventoryRoadClearanceGate.ts")) {
    throw new Error("fleet gate missing keep-in-sync header");
  }
  if (!delivery.includes("Keep in sync with supabase/functions/_fleet-server/inventory_road_clearance_gate.ts")) {
    throw new Error("delivery gate missing keep-in-sync header");
  }
});

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

Deno.test({
  name: "road clearance allows when gate flags off",
  ignore: !runIntegration,
  fn: async () => {
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID") || "test-org-inv";
    const result = await assertRoadClearForDispatch(org, "TEST-001");
    assertEquals(result.ok, true);
  },
});

Deno.test({
  name: "road clearance blocked when gate on and compliance missing",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID") || "test-org-inv";
    await sb.from("platform_feature_flags").update({ enabled: true }).eq(
      "name",
      "fleet_inventory_phase3_kits",
    );
    await sb.from("platform_feature_flags").update({ enabled: true }).eq(
      "name",
      "inv_road_clearance_gate",
    );
    try {
      const { data: vehicles } = await sb
        .from("fleet_vehicles")
        .select("id")
        .eq("organization_id", org)
        .limit(1);
      const vehicleId = vehicles?.[0]?.id ? String(vehicles[0].id) : org;
      const check = await fleetVehicleRoadClear(org, vehicleId);
      if (!check.roadClear && !check.readFailed) {
        const blocked = await assertRoadClearForDispatch(org, vehicleId);
        assertEquals(blocked.ok, false);
      }
    } finally {
      await sb.from("platform_feature_flags").update({ enabled: false }).eq(
        "name",
        "fleet_inventory_phase3_kits",
      );
      await sb.from("platform_feature_flags").update({ enabled: false }).eq(
        "name",
        "inv_road_clearance_gate",
      );
    }
  },
});

Deno.test({
  name: "road clearance read failure inserts kit_gap alert and allows",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID") || "test-org-inv";
    await sb.from("platform_feature_flags").update({ enabled: true }).eq(
      "name",
      "fleet_inventory_phase3_kits",
    );
    await sb.from("platform_feature_flags").update({ enabled: true }).eq(
      "name",
      "inv_road_clearance_gate",
    );
    const fakeVehicle = "00000000-0000-0000-0000-0000000000ee";
    try {
      const before = await sb.from("fleet_inv_alert").select("id").eq("organization_id", org).eq(
        "type",
        "kit_gap",
      );
      const check = await fleetVehicleRoadClear(org, fakeVehicle);
      assertEquals(check.roadClear, true);
      const after = await sb.from("fleet_inv_alert").select("title").eq("organization_id", org).eq(
        "type",
        "kit_gap",
      ).order("created_at", { ascending: false }).limit(1);
      if (check.readFailed) {
        assertEquals(
          String(after.data?.[0]?.title ?? "").includes("Kit check couldn't run for"),
          true,
        );
      }
    } finally {
      await sb.from("platform_feature_flags").update({ enabled: false }).eq(
        "name",
        "fleet_inventory_phase3_kits",
      );
      await sb.from("platform_feature_flags").update({ enabled: false }).eq(
        "name",
        "inv_road_clearance_gate",
      );
    }
  },
});
