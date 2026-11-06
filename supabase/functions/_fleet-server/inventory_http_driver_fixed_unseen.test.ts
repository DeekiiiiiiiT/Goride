import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
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
Deno.test({
  name: "fleet resolve then driver car-kit fixedUnseenCount then seen clears",
  ignore: !runIntegration,
  fn: async () => {
    const org = Deno.env.get("INVENTORY_TEST_ORG_ID") || "test-org-inv";
    const sb = serviceClient();
    await sb.from("fleet_inv_settings").upsert({ organization_id: org });

    const userId = "b6e1253b-8a95-4330-9af4-b636cbd3d6bb";
    const vehicleId = `${org}-vehicle-1`;
    const locCode = `VEH-${vehicleId.toUpperCase()}`;

    try {
    const { error: vehErr } = await sb.from("fleet_vehicles").upsert({
      id: vehicleId,
      organization_id: org,
      license_plate: "TEST-001",
      make: "Test",
      model: "Car",
      legacy_kv_id: `legacy-${vehicleId}`,
    });
    if (vehErr) throw new Error(vehErr.message);

    const reportNo = `RP-TEST-${Date.now()}`;
    const { data: inserted, error: insErr } = await sb.from("fleet_inv_driver_report").insert({
      organization_id: org,
      report_no: reportNo,
      vehicle_id: vehicleId,
      issue: "missing",
      note: "ZZ test",
      status: "sent",
    }).select("id").single();
    if (insErr || !inserted?.id) throw new Error(insErr?.message ?? "report insert failed");
    const reportId = String(inserted.id);

    const fleetApp = createInventoryTestApp(
      testInventoryUser({
        userId: "fleet-resolver",
        resolvedRole: "fleet_accountant",
        rawRole: "fleet_accountant",
        organizationId: org,
      }),
    );
    const resolveRes = await fleetApp.request(
      `${INVENTORY_API_PREFIX}/driver/reports/${reportId}/resolve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Fixed from stock" }),
      },
    );
    assertEquals(resolveRes.status, 200, await resolveRes.text());

    const driverApp = createInventoryTestApp(
      testInventoryUser({ userId, resolvedRole: "driver", rawRole: "driver" }),
    );
    const kitRes = await driverApp.request(
      `${INVENTORY_API_PREFIX}/driver/car-kit?vehicle_id=${encodeURIComponent(vehicleId)}`,
    );
    assertEquals(kitRes.status, 200);
    const kit = await kitRes.json();
    assertEquals(kit.fixedUnseenCount >= 1, true);

    const seenRes = await driverApp.request(
      `${INVENTORY_API_PREFIX}/driver/reports/seen?vehicle_id=${encodeURIComponent(vehicleId)}`,
      { method: "POST" },
    );
    assertEquals(seenRes.status, 200);

    const kitAfter = await (
      await driverApp.request(
        `${INVENTORY_API_PREFIX}/driver/car-kit?vehicle_id=${encodeURIComponent(vehicleId)}`,
      )
    ).json();
    assertEquals(kitAfter.fixedUnseenCount, 0);
    } finally {
      await sb.from("fleet_inv_driver_report").delete().eq("vehicle_id", vehicleId);
      await sb.from("fleet_vehicles").delete().eq("id", vehicleId);
      await sb.from("fleet_inv_location").delete().eq("vehicle_id", vehicleId);
      await sb.from("fleet_inv_location").delete().eq("organization_id", org).eq("code", locCode);
    }
  },
});
