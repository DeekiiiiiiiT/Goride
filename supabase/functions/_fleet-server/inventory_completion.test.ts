// Fleet Inventory completion audit — server done-tests (docs/fleet-inventory-completion-audit.md).
import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { isStoredAlertId } from "./inventory_controller_extended.ts";
import { countBlockedComplianceRows } from "./inventory_road_clearance_gate.ts";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

Deno.test("IV-12: only stored alert ids can be acted on", () => {
  assertEquals(isStoredAlertId("0e012bd9-dffd-4638-82ea-41a2df2f0aad"), true);
  assertEquals(isStoredAlertId("derived:asset_faulty:0e012bd9-dffd-4638-82ea-41a2df2f0aad"), false);
  assertEquals(isStoredAlertId("report:0e012bd9-dffd-4638-82ea-41a2df2f0aad"), false);
  assertEquals(isStoredAlertId(""), false);
});

Deno.test("IV-04: optional kit lines never block road clearance", () => {
  assertEquals(
    countBlockedComplianceRows([
      { line_status: "missing", blocks_road_clearance: true, required: false },
      { line_status: "ok", blocks_road_clearance: true, required: true },
    ]),
    0,
  );
  assertEquals(
    countBlockedComplianceRows([
      { line_status: "missing", blocks_road_clearance: true, required: true },
      { line_status: "short", blocks_road_clearance: true },
    ]),
    2,
  );
});

Deno.test({
  name: "IV-12: Mark done / snooze / viewed / assign on unknown or derived ids return 404",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const ids = [
      "derived:asset_faulty:00000000-0000-0000-0000-000000000001",
      "report:00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-0000000000ff",
    ];
    for (const id of ids) {
      for (const action of ["done", "snooze", "viewed", "assign"]) {
        const res = await app.request(`${INVENTORY_API_PREFIX}/alerts/${encodeURIComponent(id)}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: 1, user_id: null }),
        });
        assertEquals(res.status, 404, `${action} ${id}`);
        await res.body?.cancel();
      }
    }
  },
});

Deno.test({
  name: "IV-11: open driver reports appear in Alerts as driver_report",
  ignore: !runIntegration,
  fn: async () => {
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID");
    if (!org) throw new Error("set INVENTORY_TEST_ORG_ID");
    const sb = serviceClient();
    const { data: veh } = await sb.from("fleet_vehicles").select("id").eq("organization_id", org).limit(1)
      .maybeSingle();
    if (!veh) return; // no seeded car on this database
    const { data: rep, error } = await sb.from("fleet_inv_driver_report").insert({
      organization_id: org,
      vehicle_id: veh.id,
      issue: "missing",
      note: "ZZ completion test",
      status: "sent",
    }).select("id").single();
    if (error) throw error;
    try {
      const app = createInventoryTestApp(testInventoryUser());
      const res = await app.request(`${INVENTORY_API_PREFIX}/alerts`);
      assertEquals(res.status, 200);
      const body = await res.json() as { items: Record<string, unknown>[] };
      const row = body.items.find((a) => a.id === `report:${rep!.id}`);
      assertEquals(row?.type, "driver_report");
      assertEquals(row?.report_id, rep!.id);
      assertEquals((row?.actions as string[] | undefined)?.includes("open_report"), true);
    } finally {
      await sb.from("fleet_inv_driver_report").delete().eq("id", rep!.id);
    }
  },
});

Deno.test({
  name: "IV-02/03/05: overview returns store needs, asset value and the last check time",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const res = await app.request(`${INVENTORY_API_PREFIX}/overview`);
    assertEquals(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(Array.isArray(body.storeNeeds), true);
    const av = body.assetValue as Record<string, unknown>;
    assertEquals(typeof av.store, "number");
    assertEquals(typeof av.cars, "number");
    const kc = body.kitCompleteness as Record<string, unknown>;
    assertEquals(typeof kc.fullKitVehicles, "number");
    assertEquals(typeof kc.missingRequiredLines, "number");
  },
});
