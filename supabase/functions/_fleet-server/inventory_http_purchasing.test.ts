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

Deno.test({
  name: "POST purchase-orders blocked when phase 6 off",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const res = await app.request(`${INVENTORY_API_PREFIX}/purchase-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: "ZZ-PO-TEST" }),
    });
    assertEquals(res.status, 403);
    assertEquals((await res.json()).error, INVENTORY_PHASE_OFF_MESSAGE);
  },
});

Deno.test({
  name: "POST purchase-orders allowed when phase 6 on",
  ignore: !runIntegration,
  fn: async () => {
    const sb = serviceClient();
    await sb.from("platform_feature_flags").update({ enabled: true }).eq(
      "name",
      "fleet_inventory_phase6_purchasing",
    );
    clearFleetInventoryFeatureFlagsCache();
    try {
      const app = createInventoryTestApp(
        testInventoryUser({ resolvedRole: "platform_owner", rawRole: "platform_owner" }),
      );
      const res = await app.request(`${INVENTORY_API_PREFIX}/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: `ZZ-PO-${Date.now()}` }),
      });
      assertEquals(res.status, 200, await res.text());
    } finally {
      await sb.from("platform_feature_flags").update({ enabled: false }).eq(
        "name",
        "fleet_inventory_phase6_purchasing",
      );
      clearFleetInventoryFeatureFlagsCache();
    }
  },
});
