import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";
import { INVENTORY_PHASE_OFF_MESSAGE } from "./inventory_phase_gate.ts";
import { clearFleetInventoryFeatureFlagsCache } from "./platform_inventory_flags.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

async function assertPhaseBlocked(path: string, init?: RequestInit) {
  const app = createInventoryTestApp(testInventoryUser());
  const res = await app.request(`${INVENTORY_API_PREFIX}${path}`, init);
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, INVENTORY_PHASE_OFF_MESSAGE);
}

Deno.test({
  name: "phase 4 assets GET blocked when flag off",
  ignore: !runIntegration,
  fn: async () => {
    await assertPhaseBlocked("/assets");
  },
});

Deno.test({
  name: "phase 6 vendor POST blocked when flag off",
  ignore: !runIntegration,
  fn: async () => {
    await assertPhaseBlocked("/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ZZ Test Vendor" }),
    });
  },
});

Deno.test({
  name: "phase 7 counts POST blocked when flag off",
  ignore: !runIntegration,
  fn: async () => {
    await assertPhaseBlocked("/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ZZ-CNT-1", location_id: "00000000-0000-0000-0000-000000000001" }),
    });
  },
});

Deno.test({
  name: "phase 8 diagnostics GET blocked when flag off",
  ignore: !runIntegration,
  fn: async () => {
    await assertPhaseBlocked("/assets/00000000-0000-0000-0000-000000000099/diagnostics");
  },
});

Deno.test({
  name: "phase 6 vendor GET allowed when flag on",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    await sb.from("platform_feature_flags").update({ enabled: true }).eq(
      "name",
      "fleet_inventory_phase6_purchasing",
    );
    clearFleetInventoryFeatureFlagsCache();
    try {
      const app = createInventoryTestApp(testInventoryUser());
      const res = await app.request(`${INVENTORY_API_PREFIX}/vendors`);
      assertEquals(res.status !== 403, true);
    } finally {
      await sb.from("platform_feature_flags").update({ enabled: false }).eq(
        "name",
        "fleet_inventory_phase6_purchasing",
      );
      clearFleetInventoryFeatureFlagsCache();
    }
  },
});
